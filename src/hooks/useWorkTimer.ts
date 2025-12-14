import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { workSessionService } from '../services/workSessionService';
import * as Speech from 'expo-speech';
import i18n from '../lib/i18n';

type TimerMode = '6h' | '9h';
type WorkStatus = 'idle' | 'working' | 'poa' | 'break';

const STORAGE_KEY = 'timerState_v4'; // Incremented version to avoid conflicts

export const useWorkTimer = (userId: string | undefined, timezone: string) => {
  const [status, setStatus] = useState<WorkStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('6h');
  const [workStartTime, setWorkStartTime] = useState<string | null>(null); // Shift start time
  const [currentSegmentStart, setCurrentSegmentStart] = useState<string | null>(null);
  const [totals, setTotals] = useState({ work: 0, poa: 0, break: 0 }); // Totals for the entire session
  const [workCycleTotal, setWorkCycleTotal] = useState(0); // Work seconds since last reset, for driving time rules
  const [display, setDisplay] = useState({ work: 0, poa: 0, break: 0, shift: 0, workTimeRemaining: 0, breakDuration: 0 });

  const spokenAlerts = useRef<Set<string>>(new Set());
  const appState = useRef(AppState.currentState);

  const persistState = useCallback(async (stateToSave: any) => {
    if (stateToSave.status !== 'idle') {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const speakAlert = async (translationKey: string, force = false) => {
    if (spokenAlerts.current.has(translationKey) && !force) return;
    spokenAlerts.current.add(translationKey);
    try {
      await Speech.speak(i18n.t(translationKey), { language: i18n.language });
    } catch (e) {
      console.error("Speech error:", e);
    }
  };

  const calculateDisplay = useCallback(() => {
    if (status === 'idle' || !currentSegmentStart) return;

    const now = Date.now();
    const segmentStartTime = new Date(currentSegmentStart).getTime();
    const shiftStartTime = workStartTime ? new Date(workStartTime).getTime() : 0;
    if (isNaN(segmentStartTime)) return;

    const elapsed = Math.floor((now - segmentStartTime) / 1000);

    let currentTotalWork = totals.work;
    let currentTotalPoa = totals.poa;
    let currentTotalBreak = totals.break;
    let currentWorkCycle = workCycleTotal;
    let currentBreakDuration = 0;

    if (status === 'working') {
      currentTotalWork += elapsed;
      currentWorkCycle += elapsed;
    } else if (status === 'poa') {
      currentTotalPoa += elapsed;
    } else if (status === 'break') {
      currentTotalBreak += elapsed;
      currentBreakDuration = elapsed;
    }

    const maxWorkSeconds = timerMode === '6h' ? 6 * 3600 : 9 * 3600;
    const workTimeRemaining = Math.max(0, maxWorkSeconds - currentWorkCycle);

    setDisplay({
      work: currentTotalWork,
      poa: currentTotalPoa,
      break: currentTotalBreak,
      shift: shiftStartTime > 0 ? Math.floor((now - shiftStartTime) / 1000) : 0,
      workTimeRemaining,
      breakDuration: currentBreakDuration,
    });

    // Work time remaining alerts
    if (status === 'working') {
        if (workTimeRemaining <= 5 * 60 && workTimeRemaining > 0) speakAlert('audioWarning5h55');
        else if (workTimeRemaining <= 15 * 60 && workTimeRemaining > 0) speakAlert('audioWarning5h15');
        else if (workTimeRemaining <= 30 * 60 && workTimeRemaining > 0) speakAlert('audioWarning5h30');
    }

  }, [status, currentSegmentStart, workStartTime, totals, timerMode, workCycleTotal]);

  useEffect(() => {
    const interval = setInterval(calculateDisplay, 1000);
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        calculateDisplay();
      }
      appState.current = nextAppState;
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [calculateDisplay]);

  const startWork = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    const newTotals = { work: 0, poa: 0, break: 0 };
    setStatus('working');
    setWorkStartTime(now);
    setCurrentSegmentStart(now);
    setTotals(newTotals);
    setWorkCycleTotal(0);
    setTimerMode('6h');
    spokenAlerts.current.clear();
    try {
      const { data, error } = await workSessionService.startSession(userId, timezone);
      const newSessionId = data ? data.id : null;
      setSessionId(newSessionId);
      await persistState({ status: 'working', sessionId: newSessionId, timerMode: '6h', workStartTime: now, currentSegmentStart: now, totals: newTotals, workCycleTotal: 0 });
      speakAlert('audioShiftStarted', true);
      if (error) console.error(error);
    } catch (e) { console.error(e); }
  }, [userId, timezone, persistState]);

  const endWork = useCallback(async () => {
    const now = new Date();
    const start = new Date(currentSegmentStart || now);
    const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);

    let finalWork = totals.work;
    let finalPoa = totals.poa;
    let finalBreak = totals.break;

    if (status === 'working') finalWork += elapsed;
    if (status === 'poa') finalPoa += elapsed;
    if (status === 'break') finalBreak += elapsed;

    if (sessionId) {
      // Assuming breakCounts is no longer needed. If it is, the service call below may need adjustment.
      await workSessionService.endSession(sessionId, Math.floor(finalWork / 60), Math.floor(finalPoa / 60), Math.floor(finalBreak / 60), {});
    }

    setStatus('idle');
    setSessionId(null);
    setWorkStartTime(null);
    setCurrentSegmentStart(null);
    setTotals({ work: 0, poa: 0, break: 0 });
    setWorkCycleTotal(0);
    setDisplay({ work: 0, poa: 0, break: 0, shift: 0, workTimeRemaining: 0, breakDuration: 0 });
    setTimerMode('6h');
    speakAlert('audioShiftEnded', true);
    spokenAlerts.current.clear();
    await persistState({ status: 'idle' });
  }, [status, currentSegmentStart, totals, sessionId, persistState]);

  const togglePOA = useCallback(() => {
    if (status === 'break') return;

    const now = new Date();
    const start = new Date(currentSegmentStart || now);
    const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
    const newStatus = status === 'poa' ? 'working' : 'poa';

    const newTotals = { ...totals };
    let newWorkCycleTotal = workCycleTotal;

    if (status === 'working') {
        newTotals.work += elapsed;
        newWorkCycleTotal += elapsed;
    }
    if (status === 'poa') newTotals.poa += elapsed;

    setTotals(newTotals);
    setWorkCycleTotal(newWorkCycleTotal);
    setStatus(newStatus);
    setCurrentSegmentStart(now.toISOString());
    
    speakAlert(newStatus === 'working' ? 'audioResumeWork' : 'audioPoaStarted', true);
    
    persistState({ status: newStatus, sessionId, timerMode, workStartTime, currentSegmentStart: now.toISOString(), totals: newTotals, workCycleTotal: newWorkCycleTotal });
  }, [status, currentSegmentStart, totals, workCycleTotal, sessionId, timerMode, workStartTime, persistState]);


  const toggleBreak = useCallback(() => {
    const now = new Date();
    const start = new Date(currentSegmentStart || now);
    const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
    
    let newTotals = { ...totals };
    let newWorkCycleTotal = workCycleTotal;
    let newTimerMode = timerMode;
    let newStatus: WorkStatus;

    if (status === 'working' || status === 'poa') { // Starting a break
      newStatus = 'break';
      if (status === 'working') {
        newTotals.work += elapsed;
        newWorkCycleTotal += elapsed;
      } else { // poa
        newTotals.poa += elapsed;
      }
      speakAlert('audioBreakStarted', true);

    } else { // Ending a break (status === 'break')
      newStatus = 'working';
      newTotals.break += elapsed;
      const breakDuration = elapsed;

      if (breakDuration >= 30 * 60) {
        newWorkCycleTotal = 0; // Reset work timer
        newTimerMode = '6h';
        // Clear work warnings
        spokenAlerts.current.delete('audioWarning5h30');
        spokenAlerts.current.delete('audioWarning5h15');
        spokenAlerts.current.delete('audioWarning5h55');
      } else if (breakDuration >= 15 * 60) {
        newTimerMode = '9h'; // Extend to 9h shift
      }
      speakAlert('audioResumeWork', true);
    }
    
    setStatus(newStatus);
    setTotals(newTotals);
    setWorkCycleTotal(newWorkCycleTotal);
    setTimerMode(newTimerMode);
    setCurrentSegmentStart(now.toISOString());

    persistState({
      status: newStatus,
      sessionId,
      timerMode: newTimerMode,
      workStartTime,
      currentSegmentStart: now.toISOString(),
      totals: newTotals,
      workCycleTotal: newWorkCycleTotal
    });
  }, [status, currentSegmentStart, totals, workCycleTotal, timerMode, sessionId, workStartTime, persistState]);


  const restoreState = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state && state.status !== 'idle' && state.currentSegmentStart) {
          setStatus(state.status);
          setSessionId(state.sessionId);
          setTimerMode(state.timerMode || '6h');
          setWorkStartTime(state.workStartTime);
          setCurrentSegmentStart(state.currentSegmentStart);
          setTotals(state.totals || { work: 0, poa: 0, break: 0 });
          setWorkCycleTotal(state.workCycleTotal || 0);
        }
      }
    } catch (error) {
      console.error("Failed to restore state:", error);
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    status,
    timerMode,
    workStartTime,
    displaySeconds: display,
    startWork,
    endWork,
    togglePOA,
    toggleBreak, // New simplified break handler
    restoreState
  };
};
