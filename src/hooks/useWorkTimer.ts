import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import i18n from '../lib/i18n';
import { workSessionService } from '../services/workSessionService';
import { offlineQueueService } from '../services/offlineQueueService';

type TimerMode = '6h' | '9h';
export type WorkStatus = 'idle' | 'working' | 'poa' | 'break';

const STORAGE_KEY = 'timerState_v7';

const DRIVING_SPEED_THRESHOLD_KMH = 8;
const STILL_SPEED_THRESHOLD_KMH = 3;
const MOTION_MAGNITUDE_THRESHOLD = 0.12;
const LOCATION_TASK_NAME = 'background-location-task';

const MAX_WORK_6H = 6 * 3600;
const MAX_WORK_9H = 9 * 3600;
const MAX_DRIVE = 4.5 * 3600;

const TACHO_15_MIN = 15 * 60;
const TACHO_30_MIN = 30 * 60;
const TACHO_45_MIN = 45 * 60;

type Totals = { work: number; poa: number; break: number; driving: number };
type BreakTracker = { has15min: boolean; lastTachoBreakSegment: number };

type PersistedState = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  workCycleTotal: number;
  breakTracker: BreakTracker;
  isDriving: boolean;
  lastTickMs: number;
};

const getTachographBreakSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const legalMinutes = Math.floor(minutes / 15) * 15;
  return legalMinutes * 60;
};

const ALERT_CONFIG = {
  audioShiftStarted: { titleKey: '', bodyKey: '', sound: null as any },
  audioShiftEnded: { titleKey: '', bodyKey: '', sound: null as any },
  audioWork5h15: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft', sound: require('../../assets/sounds/SOUND_15_MIN_WARNING.mp3') },
  audioWork5h30: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft', sound: require('../../assets/sounds/SOUND_30_MIN_WARNING.mp3') },
  audioWork5h55: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft', sound: require('../../assets/sounds/SOUND_5_MIN_CRITICAL.mp3') },
  audioDriving30minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime30minLeft', sound: require('../../assets/sounds/SOUND_30_MIN_WARNING.mp3') },
  audioDriving15minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime15minLeft', sound: require('../../assets/sounds/SOUND_15_MIN_WARNING.mp3') },
  audioDriving5minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime5minLeft', sound: require('../../assets/sounds/SOUND_5_MIN_CRITICAL.mp3') },
} as const;

export const useWorkTimer = (userId: string | undefined, timezone: string) => {
  // --- UI state ---
  const [status, setStatus] = useState<WorkStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('6h');
  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [currentSegmentStart, setCurrentSegmentStart] = useState<string | null>(null);
  const [isDriving, setIsDriving] = useState(false);
  const [display, setDisplay] = useState({
    work: 0, poa: 0, break: 0, driving: 0, shift: 0,
    workTimeRemaining: MAX_WORK_6H,
    drivingTimeRemaining: MAX_DRIVE,
    breakDuration: 0,
  });
  const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

  // --- Refs = source of truth for accounting ---
  const statusRef = useRef<WorkStatus>('idle');
  const sessionIdRef = useRef<string | null>(null);
  const timerModeRef = useRef<TimerMode>('6h');
  const workStartRef = useRef<string | null>(null);
  const segmentStartRef = useRef<string | null>(null);
  const totalsRef = useRef<Totals>({ work: 0, poa: 0, break: 0, driving: 0 });
  const workCycleRef = useRef<number>(0);
  const breakTrackerRef = useRef<BreakTracker>({ has15min: false, lastTachoBreakSegment: 0 });
  const lastTickMsRef = useRef<number>(Date.now());
  const isDrivingRef = useRef<boolean>(false);

  // --- Alert tracking ---
  const prevRemainingTime = useRef({ work: MAX_WORK_6H, drive: MAX_DRIVE });
  const ukVoiceIdentifierRef = useRef<string | null>(null);

  // --- Tracking subscriptions / motion ---
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);

  // --- Helpers to sync refs -> state (UI) ---
  const syncStateFromRefs = useCallback(() => {
    setStatus(statusRef.current);
    setSessionId(sessionIdRef.current);
    setTimerMode(timerModeRef.current);
    setWorkStartTime(workStartRef.current);
    setCurrentSegmentStart(segmentStartRef.current);
    setIsDriving(isDrivingRef.current);
  }, []);

  const persistFromRefs = useCallback(async (patch?: Partial<PersistedState>) => {
    const state: PersistedState = {
      status: statusRef.current,
      sessionId: sessionIdRef.current,
      timerMode: timerModeRef.current,
      workStartTime: workStartRef.current,
      currentSegmentStart: segmentStartRef.current,
      totals: totalsRef.current,
      workCycleTotal: workCycleRef.current,
      breakTracker: breakTrackerRef.current,
      isDriving: isDrivingRef.current,
      lastTickMs: lastTickMsRef.current,
      ...(patch || {}),
    };

    if (state.status !== 'idle') {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const findUKVoice = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const ukVoice = voices.find(v => v.language === 'en-GB');
        if (ukVoice) ukVoiceIdentifierRef.current = ukVoice.identifier;
      } catch (e) {
        console.error('Failed to get voices:', e);
      }
    };
    findUKVoice();
  }, []);

  const speakAlert = useCallback((key: string) => {
    const options: Speech.SpeechOptions = {
      language: i18n.language === 'en' ? 'en-GB' : i18n.language,
    };
    if (i18n.language === 'en' && ukVoiceIdentifierRef.current) options.voice = ukVoiceIdentifierRef.current;

    try {
      Speech.speak(i18n.t(key), options);
    } catch (e) {
      console.error('Speech failed:', e);
    }
  }, []);

  const triggerAlert = useCallback(async (alertKey: keyof typeof ALERT_CONFIG) => {
    const config = ALERT_CONFIG[alertKey];
    if (!config) return;

    speakAlert(alertKey);

    // Only play sound + notification for warning-style keys
    if (config.sound && config.titleKey && config.bodyKey) {
      try {
        const { sound } = await Audio.Sound.createAsync(config.sound);
        await sound.playAsync();
      } catch (e) {
        console.error('Sound failed:', e);
      }

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t(config.titleKey),
            body: i18n.t(config.bodyKey),
            sound: 'default',
            channelId: 'compliance-alerts',
          },
          trigger: null,
        });
      } catch (e) {
        console.error('Notification failed:', e);
      }
    }
  }, [speakAlert]);

  const applyElapsed = useCallback((elapsedSec: number, lastStatus: WorkStatus, lastDriving: boolean) => {
    if (elapsedSec <= 0 || lastStatus === 'idle') return;

    const t = { ...totalsRef.current };
    let cycle = workCycleRef.current;

    if (lastStatus === 'break') t.break += elapsedSec;
    else if (lastStatus === 'poa') t.poa += elapsedSec;
    else if (lastStatus === 'working') {
      if (lastDriving) t.driving += elapsedSec;
      else t.work += elapsed. I will also address the other issues you raised. Since I can't find where the offline queue is processed, could you point me to the file that handles the "Synchronising" state and processes the offline queue? That would help me fix the other potential bugs you mentioned.
    }

    totalsRef.current = t;
    workCycleRef.current = cycle;
  }, []);

  // Restore once on mount
  useEffect(() => {
    const restore = async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (!saved || !userId) return;

      const s: PersistedState = JSON.parse(saved);

      statusRef.current = s.status;
      sessionIdRef.current = s.sessionId;
      timerModeRef.current = s.timerMode || '6h';
      workStartRef.current = s.workStartTime;
      segmentStartRef.current = s.currentSegmentStart;
      totalsRef.current = s.totals || { work: 0, poa: 0, break: 0, driving: 0 };
      workCycleRef.current = s.workCycleTotal || 0;
      breakTrackerRef.current = s.breakTracker || { has15min: false, lastTachoBreakSegment: 0 };
      isDrivingRef.current = !!s.isDriving;
      lastTickMsRef.current = s.lastTickMs || Date.now();

      // catch up from lastTickMs -> now
      const nowMs = Date.now();
      const elapsedSec = Math.max(0, Math.floor((nowMs - lastTickMsRef.current) / 1000));
      applyElapsed(elapsedSec, statusRef.current, isDrivingRef.current);

      const nowIso = new Date(nowMs).toISOString();
      segmentStartRef.current = nowIso;
      lastTickMsRef.current = nowMs;

      await persistFromRefs(); // persist corrected totals immediately
      syncStateFromRefs();
    };

    restore();
  }, [userId, applyElapsed, persistFromRefs, syncStateFromRefs]);

  // AppState catch-up (no disk reload)
  useEffect(() => {
    const onAppState = async (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        lastTickMsRef.current = Date.now();
        await persistFromRefs({ lastTickMs: lastTickMsRef.current });
        return;
      }

      if (next === 'active') {
        const nowMs = Date.now();
        const elapsedSec = Math.max(0, Math.floor((nowMs - lastTickMsRef.current) / 1000));
        applyElapsed(elapsedSec, statusRef.current, isDrivingRef.current);

        const nowIso = new Date(nowMs).toISOString();
        segmentStartRef.current = nowIso;
        lastTickMsRef.current = nowMs;

        await persistFromRefs(); // again: persist immediately so no loss after crash
        syncStateFromRefs();
      }
    };

    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [applyElapsed, persistFromRefs, syncStateFromRefs]);

  const stopTracking = useCallback(async () => {
    locationSubRef.current?.remove();
    accelSubRef.current?.remove();
    locationSubRef.current = null;
    accelSubRef.current = null;

    isDrivingRef.current = false;
    setIsDriving(false);

    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {}
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus !== 'granted') return;

      // Avoid spamming permission prompts on every render
      await Location.requestBackgroundPermissionsAsync();

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (loc) => {
          if ((loc.coords.accuracy ?? 9999) > 60) return;
          lastSpeedKmhRef.current = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
          lastSpeedTsRef.current = Date.now();
        }
      );

      Accelerometer.setUpdateInterval(500);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        const speedFresh = (now - (lastSpeedTsRef.current || 0)) < 8000;
        const speedKmh = lastSpeedKmhRef.current || 0;

        // Maintain stationary timer
        if (speedFresh && speedKmh <= STILL_SPEED_THRESHOLD_KMH) {
          if (stationarySinceRef.current === 0) stationarySinceRef.current = now;
        } else {
          stationarySinceRef.current = 0;
        }

        // TRUE instant stop (reset score + exit early)
        if (
          isDrivingRef.current &&
          speedFresh &&
          speedKmh <= STILL_SPEED_THRESHOLD_KMH &&
          stationarySinceRef.current !== 0 &&
          (now - stationarySinceRef.current) >= 1500
        ) {
          drivingScoreRef.current = 0;
          isDrivingRef.current = false;
          setIsDriving(false);
          return;
        }

        const motion = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
        const motionSuggestsMoving = motion > MOTION_MAGNITUDE_THRESHOLD;

        let score = drivingScoreRef.current;

        if (speedFresh && speedKmh >= DRIVING_SPEED_THRESHOLD_KMH) {
          score += motionSuggestsMoving ? 2 : 1;
        } else if (speedFresh && speedKmh <= STILL_SPEED_THRESHOLD_KMH) {
          score -= 4;
        } else if (!motionSuggestsMoving && !speedFresh) {
          score -= 2;
        } else {
          score -= 0.5;
        }

        score = Math.max(-6, Math.min(6, score));
        drivingScoreRef.current = score;

        const nextDriving = score >= 3 ? true : score <= 0 ? false : isDrivingRef.current;
        if (nextDriving !== isDrivingRef.current) {
          isDrivingRef.current = nextDriving;
          setIsDriving(nextDriving);
        }
      });
    } catch (e) {
      console.error('Tracking setup failed', e);
    }
  }, []);

  // Start/stop tracking based on statusRef via UI state changes
  useEffect(() => {
    if (status === 'working' || status === 'poa') startTracking();
    else stopTracking();

    return () => {
      stopTracking();
    };
  }, [status, startTracking, stopTracking]);

  // Display ticker (UI only)
  const calculateDisplay = useCallback(() => {
    if (statusRef.current === 'idle' || !segmentStartRef.current) return;

    const nowMs = Date.now();
    lastTickMsRef.current = nowMs;

    const segStartMs = new Date(segmentStartRef.current).getTime();
    const shiftStartMs = workStartRef.current ? new Date(workStartRef.current).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

    const t = totalsRef.current;
    let cycle = workCycleRef.current;

    // ephemeral totals for display (do not mutate refs here)
    const d: Totals = { ...t };

    if (statusRef.current === 'break') d.break += elapsedSec;
    else if (statusRef.current === 'poa') d.poa += elapsedSec;
    else if (statusRef.current === 'working') {
      if (isDrivingRef.current) { d.driving += elapsedSec; cycle += elapsedSec; }
      else { d.work += elapsedSec; cycle += elapsedSec; }
    }

    const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;

    setDisplay({
      work: d.work,
      poa: d.poa,
      break: d.break,
      driving: d.driving,
      shift: Math.floor((nowMs - shiftStartMs) / 1000),
      // NOTE: allow negative for overtime display + warnings
      workTimeRemaining: maxWork - cycle,
      drivingTimeRemaining: MAX_DRIVE - d.driving,
      breakDuration: statusRef.current === 'break' ? elapsedSec : 0,
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(calculateDisplay, 1000);
    return () => clearInterval(interval);
  }, [calculateDisplay]);

  // Alerts on thresholds
  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;

    const { workTimeRemaining, drivingTimeRemaining } = display;
    const prevWork = prevRemainingTime.current.work;
    const prevDrive = prevRemainingTime.current.drive;

    const check = (cur: number, prev: number, th: number, key: keyof typeof ALERT_CONFIG) => {
      if (cur <= th && prev > th) triggerAlert(key);
    };

    // Work warnings (remaining)
    check(workTimeRemaining, prevWork, 45 * 60, 'audioWork5h15');
    check(workTimeRemaining, prevWork, 30 * 60, 'audioWork5h30');
    check(workTimeRemaining, prevWork, 5 * 60, 'audioWork5h55');

    // Drive warnings (remaining)
    check(drivingTimeRemaining, prevDrive, 30 * 60, 'audioDriving30minLeft');
    check(drivingTimeRemaining, prevDrive, 15 * 60, 'audioDriving15minLeft');
    check(drivingTimeRemaining, prevDrive, 5 * 60, 'audioDriving5minLeft');

    prevRemainingTime.current = { work: workTimeRemaining, drive: drivingTimeRemaining };
  }, [display, status, triggerAlert]);

  const updateTotalsAndSwitchStatus = useCallback(async (newStatus: WorkStatus) => {
    const nowMs = Date.now();
    const segStartMs = segmentStartRef.current ? new Date(segmentStartRef.current).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

    const prevStatus = statusRef.current;
    const wasDriving = isDrivingRef.current;

    // Speak transitions
    if (prevStatus === 'working' && newStatus === 'break') speakAlert('audioBreakStarted');
    else if (prevStatus === 'break' && newStatus === 'working') speakAlert('audioResumeWork');
    else if (prevStatus === 'working' && newStatus === 'poa') speakAlert('audioPoaStarted');
    else if (prevStatus === 'poa' && newStatus === 'working') speakAlert('audioResumeWork');

    // Apply elapsed to refs
    applyElapsed(elapsedSec, prevStatus, wasDriving);

    // Break logic on exiting break
    if (prevStatus === 'break') {
      const tachoBreakSeg = getTachographBreakSeconds(elapsedSec);
      const lastTachoBreak = breakTrackerRef.current.lastTachoBreakSegment;

      const isFullReset = tachoBreakSeg >= TACHO_45_MIN;
      const isSplitReset = lastTachoBreak === TACHO_15_MIN && tachoBreakSeg >= TACHO_30_MIN;

      if (isFullReset || isSplitReset) {
        workCycleRef.current = 0;
        breakTrackerRef.current = { has15min: false, lastTachoBreakSegment: 0 };
      } else {
        breakTrackerRef.current = {
          has15min: breakTrackerRef.current.has15min || tachoBreakSeg >= TACHO_15_MIN,
          lastTachoBreakSegment: tachoBreakSeg,
        };
      }

      if (timerModeRef.current === '6h' && tachoBreakSeg >= TACHO_15_MIN) {
        timerModeRef.current = '9h';
        setTimerMode('9h');
      }
    }

    // Switch status + segment start
    const nowIso = new Date(nowMs).toISOString();
    segmentStartRef.current = nowIso;
    statusRef.current = newStatus;
    lastTickMsRef.current = nowMs;

    setCurrentSegmentStart(nowIso);
    setStatus(newStatus);

    await persistFromRefs();
  }, [applyElapsed, persistFromRefs, speakAlert]);

  const startWork = useCallback(async () => {
    if (!userId) return;

    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // Init refs
      statusRef.current = 'working';
      timerModeRef.current = '6h';
      workStartRef.current = nowIso;
      segmentStartRef.current = nowIso;
      totalsRef.current = { work: 0, poa: 0, break: 0, driving: 0 };
      workCycleRef.current = 0;
      breakTrackerRef.current = { has15min: false, lastTachoBreakSegment: 0 };
      isDrivingRef.current = false;
      lastTickMsRef.current = nowMs;

      // Init UI
      syncStateFromRefs();
      prevRemainingTime.current = { work: MAX_WORK_6H, drive: MAX_DRIVE };

      setDisplay({
        work: 0, poa: 0, break: 0, driving: 0, shift: 0,
        workTimeRemaining: MAX_WORK_6H,
        drivingTimeRemaining: MAX_DRIVE,
        breakDuration: 0,
      });

      const { data } = await workSessionService.startSession(
        userId,
        timezone,
        location.coords.latitude,
        location.coords.longitude
      );

      sessionIdRef.current = data?.id || null;
      setSessionId(sessionIdRef.current);

      await persistFromRefs();
      triggerAlert('audioShiftStarted');
    } catch (e) {
      console.error('Could not start work', e);
    }
  }, [userId, timezone, persistFromRefs, triggerAlert, syncStateFromRefs]);

  const endWork = useCallback(async () => {
    // First, finalize the current segment into totals to avoid losing the last bit.
    const nowMs = Date.now();
    const segStartMs = segmentStartRef.current ? new Date(segmentStartRef.current).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    applyElapsed(elapsedSec, statusRef.current, isDrivingRef.current);

    // compute final totals
    const finalTotals = totalsRef.current;

    let endLocation: { latitude: number; longitude: number } | null = null;
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      endLocation = { latitude: location.coords.latitude, longitude: location.coords.longitude };
    } catch (e) {
      console.error('Could not get end loc', e);
    }

    setShiftSummaryData({
      totals: {
        work: finalTotals.work,
        poa: finalTotals.poa,
        break: finalTotals.break,
        driving: finalTotals.driving,
      },
      violations: [],
      onConfirm: async () => {
        if (!sessionIdRef.current) return;

        await stopTracking();
        const toMins = (s: number) => Math.max(0, Math.floor(s / 60));

        try {
            await workSessionService.endSession(
              sessionIdRef.current,
              toMins(finalTotals.work),
              toMins(finalTotals.poa),
              toMins(finalTotals.break),
              toMins(finalTotals.driving),
              endLocation?.latitude,
              endLocation?.longitude
            );
        } catch (e) {
            console.error('Failed to end session online, queuing for offline', e);
            await offlineQueueService.addToQueue({
                type: 'END_SHIFT',
                payload: {
                    sessionId: sessionIdRef.current,
                    workMinutes: toMins(finalTotals.work),
                    poaMinutes: toMins(finalTotals.poa),
                    breakMinutes: toMins(finalTotals.break),
                    otherData: { drivingMinutes: toMins(finalTotals.driving) }
                }
            });
        }

        statusRef.current = 'idle';
        setStatus('idle');
        await persistFromRefs({ status: 'idle' });
        triggerAlert('audioShiftEnded');
        setShiftSummaryData(null);
      },
    });
  }, [applyElapsed, stopTracking, persistFromRefs, triggerAlert]);

  const toggleBreak = useCallback(() => updateTotalsAndSwitchStatus(statusRef.current === 'break' ? 'working' : 'break'), [updateTotalsAndSwitchStatus]);
  const togglePOA = useCallback(() => updateTotalsAndSwitchStatus(statusRef.current === 'poa' ? 'working' : 'poa'), [updateTotalsAndSwitchStatus]);

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
  };
};
