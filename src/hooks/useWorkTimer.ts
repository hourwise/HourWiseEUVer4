import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import i18n from '../lib/i18n';
import { workSessionService } from '../services/workSessionService';

type TimerMode = '6h' | '9h';
type WorkStatus = 'idle' | 'working' | 'poa' | 'break';

const STORAGE_KEY = 'timerState_v7';

const DRIVING_SPEED_THRESHOLD_KMH = 8;
const STILL_SPEED_THRESHOLD_KMH = 3;
const MOTION_MAGNITUDE_THRESHOLD = 0.12;
const LOCATION_TASK_NAME = 'background-location-task';

const MAX_WORK_6H = 6 * 3600;
const MAX_WORK_9H = 9 * 3600;
const MAX_DRIVE = 4.5 * 3600;

type Totals = { work: number; poa: number; break: number; driving: number };

type BreakTracker = {
  has15min: boolean;         // took at least 15 min break during current cycle
  lastBreakSegment: number;  // duration of the most recent completed break segment (seconds)
};

type PersistedState = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  workCycleTotal: number;     // work+driving since last qualifying reset
  breakTracker: BreakTracker;
  isDriving: boolean;
  // lastTickMs is no longer needed with the simplified restore logic
};

export const useWorkTimer = (userId: string | undefined, timezone: string) => {
  const [status, setStatus] = useState<WorkStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('6h');

  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [currentSegmentStart, setCurrentSegmentStart] = useState<string | null>(null);

  const [totals, setTotals] = useState<Totals>({ work: 0, poa: 0, break: 0, driving: 0 });
  const [workCycleTotal, setWorkCycleTotal] = useState(0);

  const [breakTracker, setBreakTracker] = useState<BreakTracker>({
    has15min: false,
    lastBreakSegment: 0,
  });

  const [isDriving, setIsDriving] = useState(false);

  const [display, setDisplay] = useState({
    work: 0,
    poa: 0,
    break: 0,
    driving: 0,
    shift: 0,
    workTimeRemaining: MAX_WORK_6H,
    drivingTimeRemaining: MAX_DRIVE,
    breakDuration: 0,
  });

  const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

  // audio guard
  const prevRemainingTime = useRef({ work: MAX_WORK_6H, drive: MAX_DRIVE });

  // tracking subs
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);

  // driving detection refs
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const isDrivingRef = useRef<boolean>(false);

  const speakAlert = useCallback((key: string) => {
    try {
      Speech.speak(i18n.t(key), { language: i18n.language });
    } catch {
      // ignore
    }
  }, []);

  const persistState = useCallback(
    async (patch?: Partial<PersistedState>) => {
      // Build from current state (and apply patch)
      const state: PersistedState = {
        status,
        sessionId,
        timerMode,
        workStartTime,
        currentSegmentStart,
        totals,
        workCycleTotal,
        breakTracker,
        isDriving,
        ...(patch || {}),
      };

      if (state.status !== 'idle') {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    },
    [status, sessionId, timerMode, workStartTime, currentSegmentStart, totals, workCycleTotal, breakTracker, isDriving]
  );

  const restoreState = useCallback(async () => {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved || !userId) return;

    const s: PersistedState = JSON.parse(saved);

    setStatus(s.status);
    setSessionId(s.sessionId);
    setTimerMode(s.timerMode || '6h');
    setWorkStartTime(s.workStartTime);
    setCurrentSegmentStart(s.currentSegmentStart);
    setTotals(s.totals || { work: 0, poa: 0, break: 0, driving: 0 });
    setWorkCycleTotal(s.workCycleTotal || 0);
    setBreakTracker(s.breakTracker || { has15min: false, lastBreakSegment: 0 });
    setIsDriving(!!s.isDriving);
    isDrivingRef.current = !!s.isDriving;
  }, [userId]);

  useEffect(() => {
    restoreState();
  }, [restoreState]);

  // Persist when app goes background/inactive
  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        persistState().catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [persistState]);

  const stopTracking = useCallback(async () => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;

    accelSubRef.current?.remove();
    accelSubRef.current = null;

    drivingScoreRef.current = 0;
    lastSpeedKmhRef.current = 0;
    lastSpeedTsRef.current = 0;

    try {
      const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isTaskRunning) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {
      // ignore
    }
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus !== 'granted') return;

      const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();

      // Foreground speed updates
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (loc) => {
          const acc = loc.coords.accuracy ?? 9999;
          if (acc > 60) return;

          const speedMps = loc.coords.speed ?? 0;
          const speedKmh = Math.max(0, speedMps * 3.6);

          lastSpeedKmhRef.current = speedKmh;
          lastSpeedTsRef.current = Date.now();
        }
      );
      locationSubRef.current = sub;

      // Background task (requires TaskManager.defineTask elsewhere)
      if (backStatus === 'granted') {
        const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!isTaskRunning) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 10,
            pausesLocationUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: i18n.t('notification.trackingTitle'),
              notificationBody: i18n.t('notification.trackingBody'),
              notificationColor: '#60a5fa',
            },
          });
        }
      }

      // Motion confirmation + hysteresis
      Accelerometer.setUpdateInterval(500);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const mag = Math.sqrt(x * x + y * y + z * z);
        const motion = Math.abs(mag - 1);
        const motionSuggestsMoving = motion > MOTION_MAGNITUDE_THRESHOLD;

        const now = Date.now();
        const speedAgeMs = now - (lastSpeedTsRef.current || 0);
        const speedFresh = speedAgeMs < 8000;
        const speedKmh = lastSpeedKmhRef.current || 0;

        const aboveStart = speedFresh && speedKmh >= DRIVING_SPEED_THRESHOLD_KMH;
        const belowStop = speedFresh && speedKmh <= STILL_SPEED_THRESHOLD_KMH;

        let score = drivingScoreRef.current;

        if (aboveStart && motionSuggestsMoving) score += 2;
        else if (aboveStart) score += 1;
        else if (belowStop) score -= 2;
        else if (!motionSuggestsMoving) score -= 1;

        // If GPS is stale, only nudge score slightly based on motion (prevents “walking = driving”)
        if (!speedFresh) score += motionSuggestsMoving ? 0.2 : -0.2;

        score = Math.max(-6, Math.min(6, score));
        drivingScoreRef.current = score;

        const nextDriving =
          score >= 3 ? true :
          score <= -3 ? false :
          isDrivingRef.current;

        if (nextDriving !== isDrivingRef.current) {
          isDrivingRef.current = nextDriving;
          setIsDriving(nextDriving);
        }
      });
    } catch (e) {
      console.error('Tracking setup failed', e);
    }
  }, []);

  useEffect(() => {
    if (status === 'working' || status === 'poa') {
      startTracking();
    } else {
      stopTracking();
      setIsDriving(false);
      isDrivingRef.current = false;
    }
    return () => {
      stopTracking();
    };
  }, [status, startTracking, stopTracking]);

  const calculateDisplay = useCallback(() => {
    if (status === 'idle' || !currentSegmentStart) return;

    const nowMs = Date.now();
    const segStartMs = new Date(currentSegmentStart).getTime();
    const shiftStartMs = workStartTime ? new Date(workStartTime).getTime() : nowMs;

    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    const d: Totals = { ...totals };
    let cycle = workCycleTotal;

    // Include current segment live in display (without mutating totals)
    if (status === 'break') {
      d.break += elapsedSec;
    } else if (status === 'poa') {
      d.poa += elapsedSec;
    } else if (status === 'working') {
      if (isDriving) {
        d.driving += elapsedSec;
        cycle += elapsedSec;
      } else {
        d.work += elapsedSec;
        cycle += elapsedSec;
      }
    }

    const maxWork = timerMode === '6h' ? MAX_WORK_6H : MAX_WORK_9H;

    setDisplay({
      work: d.work,
      poa: d.poa,
      break: d.break,
      driving: d.driving,
      shift: Math.floor((nowMs - shiftStartMs) / 1000),
      workTimeRemaining: Math.max(0, maxWork - cycle),
      drivingTimeRemaining: Math.max(0, MAX_DRIVE - d.driving),
      breakDuration: status === 'break' ? elapsedSec : 0, // current break segment duration
    });
  }, [status, currentSegmentStart, workStartTime, totals, workCycleTotal, timerMode, isDriving]);

  // --- TIMER INTERVAL FIX ---
  // 1. Create a ref to hold the callback
  const savedCalculateDisplay = useRef(calculateDisplay);

  // 2. Update the ref every time the callback changes
  useEffect(() => {
    savedCalculateDisplay.current = calculateDisplay;
  }, [calculateDisplay]);

  // 3. Set up the interval to call the function from the ref
  useEffect(() => {
    const tick = () => {
      savedCalculateDisplay.current();
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []); // The empty array is now correct and safe

  // Audio warnings: map to *time remaining* that corresponds to “5h15/5h30/5h55” into a 6h cycle
  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;

    const { workTimeRemaining, drivingTimeRemaining } = display;
    const prevWork = prevRemainingTime.current.work;
    const prevDrive = prevRemainingTime.current.drive;

    const checkAndSpeak = (current: number, prev: number, threshold: number, key: string) => {
      if (current <= threshold && prev > threshold) speakAlert(key);
    };

    // 6h cycle: 5h15 => 45m left; 5h30 => 30m left; 5h55 => 5m left
    checkAndSpeak(workTimeRemaining, prevWork, 45 * 60, 'audioWork5h15');
    checkAndSpeak(workTimeRemaining, prevWork, 30 * 60, 'audioWork5h30');
    checkAndSpeak(workTimeRemaining, prevWork, 5 * 60, 'audioWork5h55');

    checkAndSpeak(drivingTimeRemaining, prevDrive, 30 * 60, 'audioDriving30minLeft');
    checkAndSpeak(drivingTimeRemaining, prevDrive, 15 * 60, 'audioDriving15minLeft');
    checkAndSpeak(drivingTimeRemaining, prevDrive, 5 * 60, 'audioDriving5minLeft');

    prevRemainingTime.current = { work: workTimeRemaining, drive: drivingTimeRemaining };
  }, [display, status, speakAlert]);

  const updateTotalsAndSwitchStatus = useCallback(
    (newStatus: WorkStatus) => {
      if (!currentSegmentStart) {
        const nowIso = new Date().toISOString();
        setCurrentSegmentStart(nowIso);
        setStatus(newStatus);
        persistState({ status: newStatus, currentSegmentStart: nowIso }).catch(() => {});
        return;
      }

      const nowMs = Date.now();
      const segStartMs = new Date(currentSegmentStart).getTime();
      const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

      const prevStatus = status;
      const wasDriving = isDriving;

      // 1) roll up elapsed time into totals/cycle based on previous status
      // (note: driving only matters while working)
      setTotals((prev) => {
        const next = { ...prev };

        if (prevStatus === 'break') next.break += elapsedSec;
        else if (prevStatus === 'poa') next.poa += elapsedSec;
        else if (prevStatus === 'working') {
          if (wasDriving) next.driving += elapsedSec;
          else next.work += elapsedSec;
        }

        return next;
      });

      if (prevStatus === 'working') {
        setWorkCycleTotal((prev) => prev + elapsedSec);
      }

      // 2) break segment rules
      if (prevStatus === 'break') {
        const breakSeg = elapsedSec;
        setBreakTracker((prev) => {
          let next = { ...prev, lastBreakSegment: breakSeg };

          // mark 15min taken (enables 6h -> 9h extension)
          if (breakSeg >= 15 * 60) next.has15min = true;

          return next;
        });

        // If a qualifying break reset is taken: reset workCycleTotal
        // - full 45 min break
        // - OR split 15 + 30 (we check lastBreakSegment and current segment)
        if (elapsedSec >= 45 * 60) {
          setWorkCycleTotal(0);
          setBreakTracker({ has15min: false, lastBreakSegment: 0 });
        } else {
          const last = breakTracker.lastBreakSegment || 0;
          if ((last >= 15 * 60 && elapsedSec >= 30 * 60) || (last >= 30 * 60 && elapsedSec >= 15 * 60)) {
            setWorkCycleTotal(0);
            setBreakTracker({ has15min: false, lastBreakSegment: 0 });
          }
        }

        // If you took a 15 min break during 6h mode, extend to 9h
        if (timerMode === '6h' && elapsedSec >= 15 * 60) {
          setTimerMode('9h');
        }
      }

      // 3) switch segment
      const nowIso = new Date(nowMs).toISOString();
      setCurrentSegmentStart(nowIso);
      setStatus(newStatus);

      // 4) persist
      persistState({
        status: newStatus,
        currentSegmentStart: nowIso,
        isDriving: isDrivingRef.current,
      }).catch(() => {});
    },
    [currentSegmentStart, status, isDriving, breakTracker.lastBreakSegment, timerMode, persistState]
  );

  const startWork = useCallback(async () => {
    if (!userId) return;

    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = location.coords;

      const nowIso = new Date().toISOString();

      setStatus('working');
      setWorkStartTime(nowIso);
      setCurrentSegmentStart(nowIso);
      setTotals({ work: 0, poa: 0, break: 0, driving: 0 });
      setWorkCycleTotal(0);
      setTimerMode('6h');
      setBreakTracker({ has15min: false, lastBreakSegment: 0 });

      prevRemainingTime.current = { work: MAX_WORK_6H, drive: MAX_DRIVE };
      setDisplay({
        work: 0,
        poa: 0,
        break: 0,
        driving: 0,
        shift: 0,
        workTimeRemaining: MAX_WORK_6H,
        drivingTimeRemaining: MAX_DRIVE,
        breakDuration: 0,
      });

      const { data } = await workSessionService.startSession(userId, timezone, latitude, longitude);
      const id = data?.id || null;
      setSessionId(id);

      await persistState({
        status: 'working',
        sessionId: id,
        timerMode: '6h',
        workStartTime: nowIso,
        currentSegmentStart: nowIso,
        totals: { work: 0, poa: 0, break: 0, driving: 0 },
        workCycleTotal: 0,
        breakTracker: { has15min: false, lastBreakSegment: 0 },
        isDriving: false,
      });

      speakAlert('audioShiftStarted');
    } catch (e) {
      console.error('Could not start work with location stamp', e);
    }
  }, [userId, timezone, persistState, speakAlert]);

  const endWork = useCallback(async () => {
    const { work, poa, break: breakTime, driving } = display;

    let endLocation: { latitude: number; longitude: number } | null = null;
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      endLocation = { latitude: location.coords.latitude, longitude: location.coords.longitude };
    } catch (e) {
      console.error('Could not get end shift location', e);
    }

    setShiftSummaryData({
      totals: { work, poa, break: breakTime, driving },
      violations: [],
      onConfirm: async () => {
        if (!sessionId) return;

        await stopTracking();
        await workSessionService.endSession(
          sessionId,
          work,
          poa,
          breakTime,
          driving,
          endLocation?.latitude,
          endLocation?.longitude
        );

        setStatus('idle');
        setIsDriving(false);
        isDrivingRef.current = false;

        await persistState({ status: 'idle' });

        speakAlert('audioShiftEnded');
        setShiftSummaryData(null);
      },
    });
  }, [display, sessionId, stopTracking, persistState, speakAlert]);

  const toggleBreak = useCallback(() => {
    updateTotalsAndSwitchStatus(status === 'break' ? 'working' : 'break');
  }, [status, updateTotalsAndSwitchStatus]);

  const togglePOA = useCallback(() => {
    updateTotalsAndSwitchStatus(status === 'poa' ? 'working' : 'poa');
  }, [status, updateTotalsAndSwitchStatus]);

  return {
    status,
    timerMode,
    isDriving,
    displaySeconds: display,
    shiftSummaryData,
    setShiftSummaryData,
    startWork,
    endWork,
    togglePOA,
    toggleBreak,
    restoreState,
  };
};
