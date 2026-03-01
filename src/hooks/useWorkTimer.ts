import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import i18n from '../lib/i18n';
import { workSessionService } from '../services/workSessionService';

type TimerMode = '6h' | '9h';
export type WorkStatus = 'idle' | 'working' | 'poa' | 'break';

const STORAGE_KEY = 'timerState_v7';
const INACTIVITY_THRESHOLD_MINUTES = 5;

const DRIVING_SPEED_THRESHOLD_KMH = 8;
const STILL_SPEED_THRESHOLD_KMH = 3;
const MOTION_MAGNITUDE_THRESHOLD = 0.12;
const LOCATION_TASK_NAME = 'background-location-task';

const MAX_WORK_6H = 6 * 3600;
const MAX_WORK_9H = 9 * 3600;
const MAX_DRIVE = 4.5 * 3600;

// Tachograph rule constants (in seconds)
const TACHO_15_MIN = 15 * 60;
const TACHO_30_MIN = 30 * 60;
const TACHO_45_MIN = 45 * 60;

type Totals = { work: number; poa: number; break: number; driving: number };

type BreakTracker = {
  has15min: boolean;
  lastTachoBreakSegment: number; // Stores the legally recognized duration of the last break
};

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

export type UnconfirmedTimespan = {
  lastTickMs: number;
  restoredAtMs: number;
  assumedStatus: WorkStatus;
  isDriving: boolean;
};

// --- TACHOGRAPH LOGIC HELPER ---
const getTachographBreakSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const legalMinutes = Math.floor(minutes / 15) * 15;
  return legalMinutes * 60;
};


// Map alert keys to their specific assets and text
const ALERT_CONFIG = {
  'audioShiftStarted': { titleKey: '', bodyKey: '', sound: null },
  'audioShiftEnded': { titleKey: '', bodyKey: '', sound: null },
  'audioWork5h15': { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft', sound: require('../../assets/sounds/SOUND_15_MIN_WARNING.mp3') },
  'audioWork5h30': { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft', sound: require('../../assets/sounds/SOUND_30_MIN_WARNING.mp3') },
  'audioWork5h55': { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft', sound: require('../../assets/sounds/SOUND_5_MIN_CRITICAL.mp3') },
  'audioDriving30minLeft': { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime30minLeft', sound: require('../../assets/sounds/SOUND_30_MIN_WARNING.mp3') },
  'audioDriving15minLeft': { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime15minLeft', sound: require('../../assets/sounds/SOUND_15_MIN_WARNING.mp3') },
  'audioDriving5minLeft': { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime5minLeft', sound: require('../../assets/sounds/SOUND_5_MIN_CRITICAL.mp3') },
};

export const useWorkTimer = (userId: string | undefined, timezone: string) => {
  const [status, setStatus] = useState<WorkStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('6h');
  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [currentSegmentStart, setCurrentSegmentStart] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals>({ work: 0, poa: 0, break: 0, driving: 0 });
  const [workCycleTotal, setWorkCycleTotal] = useState(0);
  const [breakTracker, setBreakTracker] = useState<BreakTracker>({ has15min: false, lastTachoBreakSegment: 0 });
  const [isDriving, setIsDriving] = useState(false);
  const [display, setDisplay] = useState({ work: 0, poa: 0, break: 0, driving: 0, shift: 0, workTimeRemaining: MAX_WORK_6H, drivingTimeRemaining: MAX_DRIVE, breakDuration: 0 });
  const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);
  const [unconfirmedTimespan, setUnconfirmedTimespan] = useState<UnconfirmedTimespan | null>(null);

  const prevRemainingTime = useRef({ work: MAX_WORK_6H, drive: MAX_DRIVE });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const isDrivingRef = useRef<boolean>(false);
  const ukVoiceIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    const findUKVoice = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const ukVoice = voices.find(v => v.language === 'en-GB');
        if (ukVoice) {
          ukVoiceIdentifierRef.current = ukVoice.identifier;
        }
      } catch (error) {
        console.error("Failed to get available voices:", error);
      }
    };
    findUKVoice();
  }, []);

  const speakAlert = useCallback((key: string) => {
    const language = i18n.language;
    const options: Speech.SpeechOptions = {
      language: language === 'en' ? 'en-GB' : language,
    };

    if (language === 'en' && ukVoiceIdentifierRef.current) {
      options.voice = ukVoiceIdentifierRef.current;
    }

    try {
      Speech.speak(i18n.t(key), options);
    } catch (e) {
      console.error("Speech alert failed", e);
    }
  }, []);

  const triggerAlert = useCallback(async (alertKey: keyof typeof ALERT_CONFIG) => {
    const config = ALERT_CONFIG[alertKey];
    if (!config) return;

    speakAlert(alertKey);

    if (config.sound && config.titleKey && config.bodyKey) {
        try {
          const { sound } = await Audio.Sound.createAsync(config.sound);
          await sound.playAsync();
        } catch (e) { console.error('Failed to play alert sound', e); }

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
        } catch (e) { console.error("Notification scheduling failed", e); }
    }
  }, [speakAlert]);

  const persistState = useCallback(async (patch?: Partial<PersistedState>) => {
    const state: PersistedState = { status, sessionId, timerMode, workStartTime, currentSegmentStart, totals, workCycleTotal, breakTracker, isDriving, lastTickMs: Date.now(), ...(patch || {}) };
    if (state.status !== 'idle') { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } else { await AsyncStorage.removeItem(STORAGE_KEY); }
  }, [status, sessionId, timerMode, workStartTime, currentSegmentStart, totals, workCycleTotal, breakTracker, isDriving]);

  const restoreState = useCallback(async () => {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved || !userId) return;

    const s: PersistedState = JSON.parse(saved);
    const nowMs = Date.now();
    const elapsedMinutes = (nowMs - (s.lastTickMs || nowMs)) / (1000 * 60);

    if (s.status !== 'idle' && elapsedMinutes > INACTIVITY_THRESHOLD_MINUTES) {
      setUnconfirmedTimespan({ lastTickMs: s.lastTickMs, restoredAtMs: nowMs, assumedStatus: s.status, isDriving: !!s.isDriving });
    }

    setStatus(s.status);
    setSessionId(s.sessionId);
    setTimerMode(s.timerMode || '6h');
    setWorkStartTime(s.workStartTime);
    setCurrentSegmentStart(s.currentSegmentStart);
    setTotals(s.totals || { work: 0, poa: 0, break: 0, driving: 0 });
    setWorkCycleTotal(s.workCycleTotal || 0);
    setBreakTracker(s.breakTracker || { has15min: false, lastTachoBreakSegment: 0 });
    setIsDriving(!!s.isDriving);
    isDrivingRef.current = !!s.isDriving;
  }, [userId]);

  const resolveUnconfirmedTimespan = useCallback(async (action: 'confirm' | 'end_last') => {
    if (!unconfirmedTimespan) return;

    const { lastTickMs, restoredAtMs, assumedStatus, isDriving: wasDriving } = unconfirmedTimespan;
    const elapsedSec = Math.floor((restoredAtMs - lastTickMs) / 1000);

    if (action === 'confirm') {
      setTotals(prev => {
        const next = { ...prev };
        if (assumedStatus === 'break') next.break += elapsedSec;
        else if (assumedStatus === 'poa') next.poa += elapsedSec;
        else if (assumedStatus === 'working') {
          if (wasDriving) next.driving += elapsedSec;
          else next.work += elapsedSec;
        }
        return next;
      });
      if (assumedStatus === 'working') { setWorkCycleTotal(prev => prev + elapsedSec); }
    }

    const nowIso = new Date(restoredAtMs).toISOString();
    setCurrentSegmentStart(nowIso);
    setUnconfirmedTimespan(null);
    await persistState({ currentSegmentStart: nowIso });
  }, [unconfirmedTimespan, persistState]);

  useEffect(() => { restoreState(); }, [restoreState]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => { if (next === 'background' || next === 'inactive') { persistState(); } };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [persistState]);

  const stopTracking = useCallback(async () => {
    locationSubRef.current?.remove(); accelSubRef.current?.remove();
    locationSubRef.current = null; accelSubRef.current = null;
    isDrivingRef.current = false; setIsDriving(false);
    try { if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } } catch {}
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus !== 'granted') return;
      await Location.requestBackgroundPermissionsAsync();

      locationSubRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000, }, (loc) => {
        if ((loc.coords.accuracy ?? 9999) > 60) return;
        lastSpeedKmhRef.current = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
        lastSpeedTsRef.current = Date.now();
      });

      Accelerometer.setUpdateInterval(500);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const motion = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
        const motionSuggestsMoving = motion > MOTION_MAGNITUDE_THRESHOLD;
        const speedKmh = lastSpeedKmhRef.current || 0;
        const speedFresh = (Date.now() - (lastSpeedTsRef.current || 0)) < 8000;

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
    } catch (e) { console.error('Tracking setup failed', e); }
  }, []);

  useEffect(() => {
    if ((status === 'working' || status === 'poa') && !unconfirmedTimespan) { startTracking(); }
    else { stopTracking(); }
    return () => stopTracking();
  }, [status, unconfirmedTimespan, startTracking, stopTracking]);

  const calculateDisplay = useCallback(() => {
    if (status === 'idle' || !currentSegmentStart) return;
    const nowMs = Date.now();
    const segStartMs = new Date(currentSegmentStart).getTime();
    const shiftStartMs = workStartTime ? new Date(workStartTime).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    const d: Totals = { ...totals };
    let cycle = workCycleTotal;

    if (status === 'break') { d.break += elapsedSec; }
    else if (status === 'poa') { d.poa += elapsedSec; }
    else if (status === 'working') {
      if (isDriving) { d.driving += elapsedSec; cycle += elapsedSec; }
      else { d.work += elapsedSec; cycle += elapsedSec; }
    }
    const maxWork = timerMode === '6h' ? MAX_WORK_6H : MAX_WORK_9H;
    setDisplay({ work: d.work, poa: d.poa, break: d.break, driving: d.driving, shift: Math.floor((nowMs - shiftStartMs) / 1000), workTimeRemaining: Math.max(0, maxWork - cycle), drivingTimeRemaining: Math.max(0, MAX_DRIVE - d.driving), breakDuration: status === 'break' ? elapsedSec : 0 });
  }, [status, currentSegmentStart, workStartTime, totals, workCycleTotal, timerMode, isDriving]);

  const savedCalculateDisplay = useRef(calculateDisplay);
  useEffect(() => { savedCalculateDisplay.current = calculateDisplay; }, [calculateDisplay]);
  useEffect(() => {
    const tick = () => { if (!unconfirmedTimespan) savedCalculateDisplay.current(); };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [unconfirmedTimespan]);

  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;
    const { workTimeRemaining, drivingTimeRemaining } = display;
    const prevWork = prevRemainingTime.current.work;
    const prevDrive = prevRemainingTime.current.drive;
    const check = (cur: number, prev: number, th: number, key: keyof typeof ALERT_CONFIG) => { if (cur <= th && prev > th) triggerAlert(key); };
    check(workTimeRemaining, prevWork, 45 * 60, 'audioWork5h15'); check(workTimeRemaining, prevWork, 30 * 60, 'audioWork5h30'); check(workTimeRemaining, prevWork, 5 * 60, 'audioWork5h55');
    check(drivingTimeRemaining, prevDrive, 30 * 60, 'audioDriving30minLeft'); check(drivingTimeRemaining, prevDrive, 15 * 60, 'audioDriving15minLeft'); check(drivingTimeRemaining, prevDrive, 5 * 60, 'audioDriving5minLeft');
    prevRemainingTime.current = { work: workTimeRemaining, drive: drivingTimeRemaining };
  }, [display, status, triggerAlert]);

  const updateTotalsAndSwitchStatus = useCallback((newStatus: WorkStatus) => {
    if (unconfirmedTimespan) return;
    const nowMs = Date.now();
    const segStartMs = currentSegmentStart ? new Date(currentSegmentStart).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    const prevStatus = status; const wasDriving = isDriving;

    // Announce the action based on the state transition
    if (prevStatus === 'working' && newStatus === 'break') speakAlert('audioBreakStarted');
    else if (prevStatus === 'break' && newStatus === 'working') speakAlert('audioResumeWork');
    else if (prevStatus === 'working' && newStatus === 'poa') speakAlert('audioPoaStarted');
    else if (prevStatus === 'poa' && newStatus === 'working') speakAlert('audioResumeWork');


    setTotals(prev => {
      const next = { ...prev };
      if (prevStatus === 'break') next.break += elapsedSec;
      else if (prevStatus === 'poa') next.poa += elapsedSec;
      else if (prevStatus === 'working') { if (wasDriving) next.driving += elapsedSec; else next.work += elapsedSec; }
      return next;
    });

    if (prevStatus === 'working') { setWorkCycleTotal(prev => prev + elapsedSec); }

    if (prevStatus === 'break') {
      const tachoBreakSeg = getTachographBreakSeconds(elapsedSec);
      const lastTachoBreak = breakTracker.lastTachoBreakSegment;

      const isFullReset = tachoBreakSeg >= TACHO_45_MIN;
      const isSplitReset = lastTachoBreak === TACHO_15_MIN && tachoBreakSeg >= TACHO_30_MIN;

      if (isFullReset || isSplitReset) {
        setWorkCycleTotal(0);
        setBreakTracker({ has15min: false, lastTachoBreakSegment: 0 });
      } else {
        setBreakTracker(prev => ({
          has15min: prev.has15min || tachoBreakSeg >= TACHO_15_MIN,
          lastTachoBreakSegment: tachoBreakSeg,
        }));
      }

      if (timerMode === '6h' && tachoBreakSeg >= TACHO_15_MIN) {
        setTimerMode('9h');
      }
    }

    const nowIso = new Date(nowMs).toISOString();
    setCurrentSegmentStart(nowIso);
    setStatus(newStatus);
    persistState({ status: newStatus, currentSegmentStart: nowIso, isDriving: isDrivingRef.current });
  }, [currentSegmentStart, status, isDriving, breakTracker, timerMode, persistState, unconfirmedTimespan, speakAlert]);

  const startWork = useCallback(async () => {
    if (!userId) return;
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nowIso = new Date().toISOString();
      setStatus('working'); setWorkStartTime(nowIso); setCurrentSegmentStart(nowIso); setTotals({ work: 0, poa: 0, break: 0, driving: 0 });
      setWorkCycleTotal(0); setTimerMode('6h'); setBreakTracker({ has15min: false, lastTachoBreakSegment: 0 });
      prevRemainingTime.current = { work: MAX_WORK_6H, drive: MAX_DRIVE };
      setDisplay({ work: 0, poa: 0, break: 0, driving: 0, shift: 0, workTimeRemaining: MAX_WORK_6H, drivingTimeRemaining: MAX_DRIVE, breakDuration: 0 });
      const { data } = await workSessionService.startSession(userId, timezone, location.coords.latitude, location.coords.longitude);
      const id = data?.id || null; setSessionId(id);
      await persistState({ status: 'working', sessionId: id, timerMode: '6h', workStartTime: nowIso, currentSegmentStart: nowIso, totals: { work: 0, poa: 0, break: 0, driving: 0 }, workCycleTotal: 0, breakTracker: { has15min: false, lastTachoBreakSegment: 0 }, isDriving: false });
      triggerAlert('audioShiftStarted');
    } catch (e) { console.error('Could not start work with location stamp', e); }
  }, [userId, timezone, persistState, triggerAlert]);

  const endWork = useCallback(async () => {
    if (unconfirmedTimespan) return;
    const { work, poa, break: breakTime, driving } = display;
    let endLocation: { latitude: number; longitude: number } | null = null;
    try { const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); endLocation = { latitude: location.coords.latitude, longitude: location.coords.longitude }; } catch (e) { console.error('Could not get end shift location', e); }
    setShiftSummaryData({ totals: { work, poa, break: breakTime, driving }, violations: [],
      onConfirm: async () => {
        if (!sessionId) return;
        await stopTracking();
        await workSessionService.endSession(sessionId, work, poa, breakTime, driving, endLocation?.latitude, endLocation?.longitude);
        setStatus('idle');
        await persistState({ status: 'idle' });
        triggerAlert('audioShiftEnded'); setShiftSummaryData(null);
      },
    });
  }, [display, sessionId, stopTracking, persistState, triggerAlert, unconfirmedTimespan]);

  const toggleBreak = useCallback(() => updateTotalsAndSwitchStatus(status === 'break' ? 'working' : 'break'), [status, updateTotalsAndSwitchStatus]);
  const togglePOA = useCallback(() => updateTotalsAndSwitchStatus(status === 'poa' ? 'working' : 'poa'), [status, updateTotalsAndSwitchStatus]);

  return { status, timerMode, isDriving, displaySeconds: display, shiftSummaryData, setShiftSummaryData, unconfirmedTimespan, resolveUnconfirmedTimespan, startWork, endWork, togglePOA, toggleBreak, restoreState, };
};
