import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Notifications from 'expo-notifications';
import i18n from '../lib/i18n';
import { workSessionService } from '../services/workSessionService';
import { offlineQueueService } from '../services/offlineQueueService';
import { calculateCompliance } from '../lib/compliance';

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

const ALERT_TEXT = {
  audioWork5h15: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft' },
  audioWork5h30: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft' },
  audioWork5h55: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft' },

  audioDriving30minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime30minLeft' },
  audioDriving15minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime15minLeft' },
  audioDriving5minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime5minLeft' },

  audioShiftStarted: { titleKey: '', bodyKey: '' },
  audioShiftEnded: { titleKey: '', bodyKey: '' },
} as const;

type AlertKey = keyof typeof ALERT_TEXT;

export const useWorkTimer = (userId: string | undefined, timezone: string) => {
  // --- UI state ---
  const [status, setStatus] = useState<WorkStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('6h');
  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [currentSegmentStart, setCurrentSegmentStart] = useState<string | null>(null);
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

  const scheduledComplianceIdsRef = useRef<string[]>([]);
  const ukVoiceIdentifierRef = useRef<string | null>(null);

  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);

  const prevRemainingRef = useRef({
    work: MAX_WORK_6H,
    drive: MAX_DRIVE,
  });

  const applyElapsed = useCallback((elapsedSec: number, lastStatus: WorkStatus, lastDriving: boolean) => {
    if (elapsedSec <= 0 || lastStatus === 'idle') return;

    const t = { ...totalsRef.current };
    let cycle = workCycleRef.current;

    if (lastStatus === 'break') {
      t.break += elapsedSec;
    } else if (lastStatus === 'poa') {
      t.poa += elapsedSec;
      cycle += elapsedSec; // POA counts towards Working Time Directive (6h/9h)
    } else if (lastStatus === 'working') {
      if (lastDriving) t.driving += elapsedSec;
      else t.work += elapsedSec;
      cycle += elapsedSec; // Working counts towards 6h/9h
    }

    totalsRef.current = t;
    workCycleRef.current = cycle;
  }, []);

  const syncStateFromRefs = useCallback(() => {
    setStatus(statusRef.current);
    setSessionId(sessionIdRef.current);
    setTimerMode(timerModeRef.current);
    setWorkStartTime(workStartRef.current);
    setCurrentSegmentStart(segmentStartRef.current);
    setIsDriving(isDrivingRef.current);
  }, []);

  const cancelScheduledComplianceNotifications = useCallback(async (isEndingShift = false) => {
    const ids = scheduledComplianceIdsRef.current;
    scheduledComplianceIdsRef.current = [];

    // Cancel our tracked IDs
    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));

    // If ending shift or logging out, wipe EVERYTHING from the OS to be safe
    if (isEndingShift) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }, []);

  const buildComplianceSchedule = useCallback(async () => {
    await cancelScheduledComplianceNotifications();

    const st = statusRef.current;
    if (st !== 'working' && st !== 'poa') return;

    const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;
    const remainingWork = maxWork - workCycleRef.current;

    const totalDriveTime = totalsRef.current.driving;
    const remainingDrive = MAX_DRIVE - totalDriveTime;

    const scheduleAtThreshold = async (remaining: number, threshold: number, titleKey: string, bodyKey: string, channelId: string) => {
      const inSeconds = remaining - threshold;
      if (inSeconds <= 0) return;

      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t(titleKey),
            body: i18n.t(bodyKey),
            priority: 'max',
            categoryIdentifier: 'alarm',
            channelId: channelId,
          },
          trigger: { seconds: Math.floor(inSeconds) },
        });
        scheduledComplianceIdsRef.current.push(id);
      } catch (e) {
        console.error('Notification failed:', e);
      }
    };

    // --- WORK ALERTS (Always relevant once shift starts) ---
    await scheduleAtThreshold(remainingWork, 45 * 60, 'workTimeWarningTitle', 'workTime15minLeft', 'channel-30min-v6');
    await scheduleAtThreshold(remainingWork, 30 * 60, 'workTimeWarningTitle', 'workTime30minLeft', 'channel-15min-v6');
    await scheduleAtThreshold(remainingWork, 5 * 60, 'workTimeWarningTitle', 'workTime5minLeft', 'channel-critical-v6');

    // --- DRIVING ALERTS (Only if they've actually driven) ---
    if (totalDriveTime > 0) {
      await scheduleAtThreshold(remainingDrive, 30 * 60, 'drivingTimeWarningTitle', 'drivingTime30minLeft', 'channel-30min-v6');
      await scheduleAtThreshold(remainingDrive, 15 * 60, 'drivingTimeWarningTitle', 'drivingTime15minLeft', 'channel-15min-v6');
      await scheduleAtThreshold(remainingDrive, 5 * 60, 'drivingTimeWarningTitle', 'drivingTime5minLeft', 'channel-critical-v6');
    }
  }, [cancelScheduledComplianceNotifications]);

  const persistFromRefs = useCallback(async () => {
    const nowMs = Date.now();

    if (statusRef.current !== 'idle' && segmentStartRef.current) {
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      if (elapsedSinceSegment > 0) {
        applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
        segmentStartRef.current = new Date(nowMs).toISOString();
      }
    }

    lastTickMsRef.current = nowMs;

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
      lastTickMs: nowMs,
    };

    if (state.status !== 'idle') {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, [applyElapsed]);

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

  const vibrateAlert = useCallback(() => {
    Vibration.vibrate([0, 300, 150, 300, 150, 500]);
  }, []);

  const speakAlert = useCallback((key: string) => {
    const options: Speech.SpeechOptions = {
      language: i18n.language === 'en' ? 'en-GB' : i18n.language,
    };
    if (i18n.language === 'en' && ukVoiceIdentifierRef.current) {
      options.voice = ukVoiceIdentifierRef.current;
    }

    try {
      Speech.speak(i18n.t(key), options);
    } catch (e) {
      console.error('Speech failed:', e);
    }
  }, []);

  const triggerImmediateAlert = useCallback(async (alertKey: AlertKey) => {
    const cfg = ALERT_TEXT[alertKey];

    speakAlert(alertKey);
    vibrateAlert();

    if (!cfg.titleKey || !cfg.bodyKey) return;

    let channel = 'compliance-alerts-v6';
    if (alertKey.includes('5h55') || alertKey.includes('5min')) channel = 'channel-critical-v6';
    else if (alertKey.includes('5h30') || alertKey.includes('15min')) channel = 'channel-15min-v6';
    else if (alertKey.includes('5h15') || alertKey.includes('30min')) channel = 'channel-30min-v6';

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t(cfg.titleKey),
          body: i18n.t(cfg.bodyKey),
          priority: 'max',
          categoryIdentifier: 'alarm',
          channelId: channel,
        },
        trigger: null,
      });
    } catch (e) {
      console.error('Immediate notification failed:', e);
    }
  }, [speakAlert, vibrateAlert]);

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

      const nowMs = Date.now();
      const lastTick = s.lastTickMs || nowMs;
      const elapsedSec = Math.max(0, Math.floor((nowMs - lastTick) / 1000));

      applyElapsed(elapsedSec, statusRef.current, isDrivingRef.current);

      segmentStartRef.current = new Date(nowMs).toISOString();
      lastTickMsRef.current = nowMs;

      syncStateFromRefs();
      await buildComplianceSchedule();
    };

    restore();
  }, [userId, applyElapsed, syncStateFromRefs, buildComplianceSchedule]);

  useEffect(() => {
    return () => {
      cancelScheduledComplianceNotifications(true);
    };
  }, [userId, cancelScheduledComplianceNotifications]);

  useEffect(() => {
    const onAppState = async (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        await persistFromRefs();
        return;
      }

      if (next === 'active') {
        const nowMs = Date.now();
        if (statusRef.current !== 'idle' && segmentStartRef.current) {
          const segStartMs = new Date(segmentStartRef.current).getTime();
          const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

          if (elapsedSinceSegment > 0) {
            applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
            segmentStartRef.current = new Date(nowMs).toISOString();
          }
        }
        lastTickMsRef.current = nowMs;

        await persistFromRefs();
        syncStateFromRefs();
        await buildComplianceSchedule();
      }
    };

    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [applyElapsed, persistFromRefs, syncStateFromRefs, buildComplianceSchedule]);

  const updateTotalsAndSwitchStatus = useCallback(async (newStatus: WorkStatus) => {
    await cancelScheduledComplianceNotifications();

    const nowMs = Date.now();
    const segStartMs = segmentStartRef.current ? new Date(segmentStartRef.current).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

    const prevStatus = statusRef.current;
    const wasDriving = isDrivingRef.current;

    applyElapsed(elapsedSec, prevStatus, wasDriving);

    if (prevStatus === 'break') {
      const tachoBreakSeg = getTachographBreakSeconds(elapsedSec);
      const isFullReset = tachoBreakSeg >= TACHO_45_MIN;
      const isSplitReset = breakTrackerRef.current.has15min && tachoBreakSeg >= TACHO_30_MIN;

      if (isFullReset || isSplitReset) {
        workCycleRef.current = 0;
        breakTrackerRef.current = { has15min: false, lastTachoBreakSegment: 0 };
        timerModeRef.current = '6h';
        setTimerMode('6h');
      } else {
        const currentIs15 = tachoBreakSeg >= TACHO_15_MIN;
        breakTrackerRef.current = {
          has15min: breakTrackerRef.current.has15min || currentIs15,
          lastTachoBreakSegment: tachoBreakSeg,
        };

        if (timerModeRef.current === '6h' && currentIs15) {
          timerModeRef.current = '9h';
          setTimerMode('9h');
        }
      }
    }

    const nowIso = new Date(nowMs).toISOString();
    segmentStartRef.current = nowIso;
    statusRef.current = newStatus;
    lastTickMsRef.current = nowMs;

    setCurrentSegmentStart(nowIso);
    setStatus(newStatus);

    await persistFromRefs();

    if (newStatus === 'working' || newStatus === 'poa') {
      await buildComplianceSchedule();
    }

    if (prevStatus === 'working' && newStatus === 'break') speakAlert('audioBreakStarted');
    else if (prevStatus === 'break' && newStatus === 'working') speakAlert('audioResumeWork');
  }, [applyElapsed, persistFromRefs, speakAlert, cancelScheduledComplianceNotifications, buildComplianceSchedule]);

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

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
        (loc) => {
          if ((loc.coords.accuracy ?? 9999) > 60) return;
          lastSpeedKmhRef.current = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
          lastSpeedTsRef.current = Date.now();
        }
      );

      if (bgStatus === 'granted') {
        if (!await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 10,
            pausesLocationUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: i18n.t('notification.trackingTitle', 'HourWise active'),
              notificationBody: i18n.t('notification.trackingBody', 'Tracking work and driving time'),
              notificationColor: '#60a5fa',
            },
          });
        }
      }

      Accelerometer.setUpdateInterval(500);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        const speedFresh = (now - (lastSpeedTsRef.current || 0)) < 8000;
        const speedKmh = lastSpeedKmhRef.current || 0;

        if (speedFresh && speedKmh <= STILL_SPEED_THRESHOLD_KMH) {
          if (stationarySinceRef.current === 0) stationarySinceRef.current = now;
        } else {
          stationarySinceRef.current = 0;
        }

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
        let score = drivingScoreRef.current;
        if (speedFresh && speedKmh >= DRIVING_SPEED_THRESHOLD_KMH) {
          score += motion > MOTION_MAGNITUDE_THRESHOLD ? 2 : 1;
        } else {
          score -= 2;
        }
        score = Math.max(-6, Math.min(6, score));
        drivingScoreRef.current = score;

        const nextDriving = score >= 3 ? true : score <= 0 ? false : isDrivingRef.current;
        if (nextDriving !== isDrivingRef.current) {
          isDrivingRef.current = nextDriving;
          setIsDriving(nextDriving);
          buildComplianceSchedule();
        }
      });
    } catch (e) {
      console.error('Tracking setup failed', e);
    }
  }, [buildComplianceSchedule]);

  useEffect(() => {
    if (status === 'working' || status === 'poa') startTracking();
    else stopTracking();
    return () => stopTracking();
  }, [status, startTracking, stopTracking]);

  const calculateDisplay = useCallback(() => {
    if (statusRef.current === 'idle' || !segmentStartRef.current) return;

    const nowMs = Date.now();
    const segStartMs = new Date(segmentStartRef.current).getTime();
    const shiftStartMs = workStartRef.current ? new Date(workStartRef.current).getTime() : nowMs;
    const elapsedSecSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

    const t = { ...totalsRef.current };
    let cycle = workCycleRef.current;
    const d: Totals = { ...t };

    if (statusRef.current === 'break') d.break += elapsedSecSinceSegment;
    else if (statusRef.current === 'poa') {
      d.poa += elapsedSecSinceSegment;
      cycle += elapsedSecSinceSegment;
    } else if (statusRef.current === 'working') {
      if (isDrivingRef.current) d.driving += elapsedSecSinceSegment;
      else d.work += elapsedSecSinceSegment;
      cycle += elapsedSecSinceSegment;
    }

    const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;

    setDisplay({
      work: d.work,
      poa: d.poa,
      break: d.break,
      driving: d.driving,
      shift: Math.floor((nowMs - shiftStartMs) / 1000),
      workTimeRemaining: maxWork - cycle,
      drivingTimeRemaining: MAX_DRIVE - d.driving,
      breakDuration: statusRef.current === 'break' ? elapsedSecSinceSegment : 0,
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(calculateDisplay, 1000);
    return () => clearInterval(interval);
  }, [calculateDisplay]);

  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;

    const currentWork = display.workTimeRemaining;
    const currentDrive = display.drivingTimeRemaining;
    const prevWork = prevRemainingRef.current.work;
    const prevDrive = prevRemainingRef.current.drive;

    const crossedDown = (current: number, prev: number, threshold: number) =>
      current <= threshold && prev > threshold;

    if (crossedDown(currentWork, prevWork, 45 * 60)) triggerImmediateAlert('audioWork5h15');
    if (crossedDown(currentWork, prevWork, 30 * 60)) triggerImmediateAlert('audioWork5h30');
    if (crossedDown(currentWork, prevWork, 5 * 60)) triggerImmediateAlert('audioWork5h55');

    if (crossedDown(currentDrive, prevDrive, 30 * 60)) triggerImmediateAlert('audioDriving30minLeft');
    if (crossedDown(currentDrive, prevDrive, 15 * 60)) triggerImmediateAlert('audioDriving15minLeft');
    if (crossedDown(currentDrive, prevDrive, 5 * 60)) triggerImmediateAlert('audioDriving5minLeft');

    prevRemainingRef.current = { work: currentWork, drive: currentDrive };
  }, [status, display.workTimeRemaining, display.drivingTimeRemaining, triggerImmediateAlert]);

  const startWork = useCallback(async () => {
    await cancelScheduledComplianceNotifications(true);
    if (!userId) return;

    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      statusRef.current = 'working';
      timerModeRef.current = '6h';
      workStartRef.current = nowIso;
      segmentStartRef.current = nowIso;
      totalsRef.current = { work: 0, poa: 0, break: 0, driving: 0 };
      workCycleRef.current = 0;
      breakTrackerRef.current = { has15min: false, lastTachoBreakSegment: 0 };
      isDrivingRef.current = false;
      lastTickMsRef.current = nowMs;

      syncStateFromRefs();
      setDisplay({ work: 0, poa: 0, break: 0, driving: 0, shift: 0, workTimeRemaining: MAX_WORK_6H, drivingTimeRemaining: MAX_DRIVE, breakDuration: 0 });
      prevRemainingRef.current = { work: MAX_WORK_6H, drive: MAX_DRIVE };

      const { data } = await workSessionService.startSession(userId, timezone, location.coords.latitude, location.coords.longitude);
      sessionIdRef.current = data?.id || null;
      setSessionId(sessionIdRef.current);

      await persistFromRefs();
      await buildComplianceSchedule();
      speakAlert('audioShiftStarted');
    } catch (e) {
      console.error('Could not start work', e);
    }
  }, [userId, timezone, persistFromRefs, syncStateFromRefs, buildComplianceSchedule, cancelScheduledComplianceNotifications, speakAlert]);

  const endWork = useCallback(async () => {
    const nowMs = Date.now();
    const segStartMs = segmentStartRef.current ? new Date(segmentStartRef.current).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    applyElapsed(elapsedSec, statusRef.current, isDrivingRef.current);
    const finalTotals = totalsRef.current;

    const toMins = (s: number) => Math.max(0, Math.floor(s / 60));
    const currentShiftAsSession: any = {
      total_work_minutes: toMins(finalTotals.work),
      total_break_minutes: toMins(finalTotals.break),
      total_poa_minutes: toMins(finalTotals.poa),
      other_data: { driving: toMins(finalTotals.driving) },
      start_time: workStartRef.current,
    };
    const { score, violations } = calculateCompliance([currentShiftAsSession], null, 0, 0);
    let endLocation: { latitude: number; longitude: number } | null = null;
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      endLocation = { latitude: location.coords.latitude, longitude: location.coords.longitude };
    } catch (e) {
      console.error('Could not get end loc', e);
    }

    setShiftSummaryData({
      totals: finalTotals,
      violations: violations,
      onConfirm: async () => {
        if (!sessionIdRef.current) return;
        await stopTracking();
        await cancelScheduledComplianceNotifications(true);

        try {
          await workSessionService.endSession(
            sessionIdRef.current, toMins(finalTotals.work), toMins(finalTotals.poa),
            toMins(finalTotals.break), toMins(finalTotals.driving),
            endLocation?.latitude, endLocation?.longitude, score, violations
          );
        } catch (e) {
          await offlineQueueService.addToQueue({
            type: 'END_SHIFT',
            payload: {
              sessionId: sessionIdRef.current, workMinutes: toMins(finalTotals.work),
              poaMinutes: toMins(finalTotals.poa), breakMinutes: toMins(finalTotals.break),
              otherData: { driving: toMins(finalTotals.driving) },
            },
          });
        } finally {
          statusRef.current = 'idle';
          setStatus('idle');
          await persistFromRefs();
          speakAlert('audioShiftEnded');
          setShiftSummaryData(null);
        }
      },
    });
  }, [applyElapsed, stopTracking, cancelScheduledComplianceNotifications, speakAlert]);

  const toggleBreak = useCallback(() => updateTotalsAndSwitchStatus(statusRef.current === 'break' ? 'working' : 'break'), [updateTotalsAndSwitchStatus]);
  const togglePOA = useCallback(() => updateTotalsAndSwitchStatus(statusRef.current === 'poa' ? 'working' : 'poa'), [updateTotalsAndSwitchStatus]);

  return { status, timerMode, isDriving, displaySeconds: display, shiftSummaryData, setShiftSummaryData, startWork, endWork, togglePOA, toggleBreak };
};
