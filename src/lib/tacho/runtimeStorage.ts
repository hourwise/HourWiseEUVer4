import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  appendMotionDiagnosticRecords,
  appendTimerDiagnosticRecords,
  formatCombinedDiagnosticsExport,
  formatMotionDiagnosticsExport,
  type MotionDiagnosticRecord,
  type TimerDiagnosticRecord,
} from './diagnostics';
import { PERSISTED_STATE_VERSION } from './constants';
import type {
  PersistedState,
  ScheduledAlertDescriptor,
  WorkStatus,
} from './types';

export const ACTIVE_TIMER_STATE_KEY = 'active_timer_state_v1';
export const SCHEDULED_COMPLIANCE_NOTIFICATION_IDS_KEY =
  'scheduled_compliance_notification_ids_v1';
export const SCHEDULED_DRIVE_NOTIFICATION_IDS_KEY =
  'scheduled_drive_notification_ids_v1';
export const SCHEDULED_COMPLIANCE_ALERTS_KEY =
  'scheduled_compliance_alerts_v1';
export const SCHEDULED_DRIVE_ALERTS_KEY =
  'scheduled_drive_alerts_v1';
export const BACKGROUND_ALERT_STATE_KEY = 'background_alert_state_v1';
export const BACKGROUND_TASK_DIAGNOSTICS_KEY =
  'background_task_diagnostics_v1';
export const MOTION_DIAGNOSTICS_RING_KEY = 'motion_diagnostics_ring_v1';
export const TIMER_DIAGNOSTICS_RING_KEY = 'timer_diagnostics_ring_v1';

export type BackgroundAlertState = {
  status: WorkStatus;
  isDriving: boolean;
  drivingTimeRemaining: number;
  driveExtensionRemaining: number;
  weeklyDrivingRemaining: number;
};

export type BackgroundTaskDiagnostics = {
  lastRunAtMs: number;
  lastSpeedKmh: number;
  persistedStatus: WorkStatus | 'missing';
  lastTriggeredAlertKey: string | null;
};

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Validation helper to ensure persisted state integrity
const validatePersistedState = (state: PersistedState): boolean => {
  // Check critical fields
  if (!state || typeof state.status !== 'string') return false;
  if (typeof state.totals !== 'object') return false;
  if (
    state.stateVersion !== undefined &&
    state.stateVersion !== PERSISTED_STATE_VERSION
  ) {
    return false;
  }
  if (state.userId !== undefined && state.userId !== null && typeof state.userId !== 'string') {
    return false;
  }
  if (state.status !== 'idle' && !state.sessionId) return false;
  if (state.status !== 'idle' && !state.workStartTime) return false;
  if (!isFiniteNonNegative(state.totals.work)) return false;
  if (!isFiniteNonNegative(state.totals.poa)) return false;
  if (!isFiniteNonNegative(state.totals.break)) return false;
  if (!isFiniteNonNegative(state.totals.driving)) return false;
  if (!isFiniteNonNegative(state.lastTickMs)) return false;
  if (
    state.lastSavedAtMs !== undefined &&
    (!isFiniteNonNegative(state.lastSavedAtMs) || state.lastSavedAtMs > Date.now() + 86400000)
  ) {
    return false;
  }
  if (
    state.lastCheckpointAtMs !== undefined &&
    state.lastCheckpointAtMs !== null &&
    !isFiniteNonNegative(state.lastCheckpointAtMs)
  ) {
    return false;
  }

  // Validate segment start is valid ISO string when not idle
  if (state.status !== 'idle' && state.currentSegmentStart) {
    try {
      const ts = new Date(state.currentSegmentStart).getTime();
      if (isNaN(ts) || ts < 0) return false;
    } catch {
      return false;
    }
  }

  // Validate breakStartMs is reasonable
  if (state.breakStartMs && (state.breakStartMs < 0 || state.breakStartMs > Date.now())) {
    return false;
  }

  return true;
};

export const loadActiveTimerState = async () => {
  const raw = await AsyncStorage.getItem(ACTIVE_TIMER_STATE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedState;
    // Validate before returning
    if (!validatePersistedState(parsed)) {
      console.warn('Invalid persisted state, discarding');
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('Failed to parse persisted state:', e);
    return null;
  }
};

export const saveActiveTimerState = async (state: PersistedState) => {
  try {
    const json = JSON.stringify(state);
    await AsyncStorage.setItem(ACTIVE_TIMER_STATE_KEY, json);
    if (state.userStorageKey) {
      await AsyncStorage.setItem(state.userStorageKey, json);
    }
  } catch (e) {
    console.error('Failed to save active timer state:', e);
  }
};

export const clearActiveTimerState = async (userStorageKey?: string | null) => {
  try {
    await AsyncStorage.removeItem(ACTIVE_TIMER_STATE_KEY);
    if (userStorageKey) {
      await AsyncStorage.removeItem(userStorageKey);
    }
  } catch (e) {
    console.error('Failed to clear active timer state:', e);
  }
};

export const loadScheduledComplianceNotificationIds = async () => {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_COMPLIANCE_NOTIFICATION_IDS_KEY);
    if (!raw) return [] as string[];
    return JSON.parse(raw) as string[];
  } catch (e) {
    console.warn('Failed to load scheduled compliance notification IDs:', e);
    return [] as string[];
  }
};

export const saveScheduledComplianceNotificationIds = async (ids: string[]) => {
  try {
    await AsyncStorage.setItem(
      SCHEDULED_COMPLIANCE_NOTIFICATION_IDS_KEY,
      JSON.stringify(ids)
    );
  } catch (e) {
    console.error('Failed to save scheduled compliance notification IDs:', e);
  }
};

export const clearScheduledComplianceNotificationIds = async () => {
  try {
    await AsyncStorage.removeItem(SCHEDULED_COMPLIANCE_NOTIFICATION_IDS_KEY);
  } catch (e) {
    console.error('Failed to clear scheduled compliance notification IDs:', e);
  }
};

export const loadScheduledDriveNotificationIds = async () => {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_DRIVE_NOTIFICATION_IDS_KEY);
    if (!raw) return [] as string[];
    return JSON.parse(raw) as string[];
  } catch (e) {
    console.warn('Failed to load scheduled drive notification IDs:', e);
    return [] as string[];
  }
};

export const saveScheduledDriveNotificationIds = async (ids: string[]) => {
  try {
    await AsyncStorage.setItem(
      SCHEDULED_DRIVE_NOTIFICATION_IDS_KEY,
      JSON.stringify(ids)
    );
  } catch (e) {
    console.error('Failed to save scheduled drive notification IDs:', e);
  }
};

export const clearScheduledDriveNotificationIds = async () => {
  try {
    await AsyncStorage.removeItem(SCHEDULED_DRIVE_NOTIFICATION_IDS_KEY);
  } catch (e) {
    console.error('Failed to clear scheduled drive notification IDs:', e);
  }
};

const loadScheduledAlerts = async (storageKey: string) => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return [] as ScheduledAlertDescriptor[];
    return JSON.parse(raw) as ScheduledAlertDescriptor[];
  } catch (e) {
    console.warn(`Failed to load scheduled alerts for ${storageKey}:`, e);
    return [] as ScheduledAlertDescriptor[];
  }
};

const saveScheduledAlerts = async (
  storageKey: string,
  alerts: ScheduledAlertDescriptor[],
) => {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(alerts));
  } catch (e) {
    console.error(`Failed to save scheduled alerts for ${storageKey}:`, e);
  }
};

const clearScheduledAlerts = async (storageKey: string) => {
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch (e) {
    console.error(`Failed to clear scheduled alerts for ${storageKey}:`, e);
  }
};

export const loadScheduledComplianceAlerts = async () =>
  loadScheduledAlerts(SCHEDULED_COMPLIANCE_ALERTS_KEY);

export const saveScheduledComplianceAlerts = async (
  alerts: ScheduledAlertDescriptor[],
) => {
  await saveScheduledAlerts(SCHEDULED_COMPLIANCE_ALERTS_KEY, alerts);
  await saveScheduledComplianceNotificationIds(alerts.map(alert => alert.identifier));
};

export const clearScheduledComplianceAlerts = async () => {
  await Promise.all([
    clearScheduledAlerts(SCHEDULED_COMPLIANCE_ALERTS_KEY),
    clearScheduledComplianceNotificationIds(),
  ]);
};

export const loadScheduledDriveAlerts = async () =>
  loadScheduledAlerts(SCHEDULED_DRIVE_ALERTS_KEY);

export const saveScheduledDriveAlerts = async (
  alerts: ScheduledAlertDescriptor[],
) => {
  await saveScheduledAlerts(SCHEDULED_DRIVE_ALERTS_KEY, alerts);
  await saveScheduledDriveNotificationIds(alerts.map(alert => alert.identifier));
};

export const clearScheduledDriveAlerts = async () => {
  await Promise.all([
    clearScheduledAlerts(SCHEDULED_DRIVE_ALERTS_KEY),
    clearScheduledDriveNotificationIds(),
  ]);
};


export const loadBackgroundAlertState = async () => {
  try {
    const raw = await AsyncStorage.getItem(BACKGROUND_ALERT_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BackgroundAlertState;
  } catch (e) {
    console.warn('Failed to load background alert state:', e);
    return null;
  }
};

export const saveBackgroundAlertState = async (state: BackgroundAlertState) => {
  try {
    await AsyncStorage.setItem(BACKGROUND_ALERT_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save background alert state:', e);
  }
};

export const clearBackgroundAlertState = async () => {
  try {
    await AsyncStorage.removeItem(BACKGROUND_ALERT_STATE_KEY);
  } catch (e) {
    console.error('Failed to clear background alert state:', e);
  }
};

export const loadBackgroundTaskDiagnostics = async () => {
  try {
    const raw = await AsyncStorage.getItem(BACKGROUND_TASK_DIAGNOSTICS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BackgroundTaskDiagnostics;
  } catch (e) {
    console.warn('Failed to load background task diagnostics:', e);
    return null;
  }
};

export const saveBackgroundTaskDiagnostics = async (
  diagnostics: BackgroundTaskDiagnostics,
) => {
  try {
    await AsyncStorage.setItem(
      BACKGROUND_TASK_DIAGNOSTICS_KEY,
      JSON.stringify(diagnostics)
    );
  } catch (e) {
    console.error('Failed to save background task diagnostics:', e);
  }
};

export const clearBackgroundTaskDiagnostics = async () => {
  try {
    await AsyncStorage.removeItem(BACKGROUND_TASK_DIAGNOSTICS_KEY);
  } catch (e) {
    console.error('Failed to clear background task diagnostics:', e);
  }
};

export const loadMotionDiagnosticsRing = async () => {
  try {
    const raw = await AsyncStorage.getItem(MOTION_DIAGNOSTICS_RING_KEY);
    if (!raw) return [] as MotionDiagnosticRecord[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as MotionDiagnosticRecord[] : [];
  } catch (e) {
    console.warn('Failed to load motion diagnostics:', e);
    return [] as MotionDiagnosticRecord[];
  }
};

export const appendMotionDiagnosticsRing = async (
  records: MotionDiagnosticRecord | MotionDiagnosticRecord[],
) => {
  try {
    const existing = await loadMotionDiagnosticsRing();
    const next = appendMotionDiagnosticRecords(
      existing,
      Array.isArray(records) ? records : [records],
    );
    await AsyncStorage.setItem(MOTION_DIAGNOSTICS_RING_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('Failed to save motion diagnostics:', e);
  }
};

export const loadTimerDiagnosticsRing = async () => {
  try {
    const raw = await AsyncStorage.getItem(TIMER_DIAGNOSTICS_RING_KEY);
    if (!raw) return [] as TimerDiagnosticRecord[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as TimerDiagnosticRecord[] : [];
  } catch (e) {
    console.warn('Failed to load timer diagnostics:', e);
    return [] as TimerDiagnosticRecord[];
  }
};

export const appendTimerDiagnosticsRing = async (
  records: TimerDiagnosticRecord | TimerDiagnosticRecord[],
) => {
  try {
    const existing = await loadTimerDiagnosticsRing();
    const next = appendTimerDiagnosticRecords(
      existing,
      Array.isArray(records) ? records : [records],
    );
    await AsyncStorage.setItem(TIMER_DIAGNOSTICS_RING_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('Failed to save timer diagnostics:', e);
  }
};

export const exportMotionDiagnosticsRing = async () => {
  const records = await loadMotionDiagnosticsRing();
  return formatMotionDiagnosticsExport(records);
};

export const exportCombinedTimerDiagnostics = async () => {
  const [motionRecords, timerRecords] = await Promise.all([
    loadMotionDiagnosticsRing(),
    loadTimerDiagnosticsRing(),
  ]);
  return formatCombinedDiagnosticsExport({ motionRecords, timerRecords });
};

export const clearMotionDiagnosticsRing = async () => {
  try {
    await AsyncStorage.removeItem(MOTION_DIAGNOSTICS_RING_KEY);
  } catch (e) {
    console.error('Failed to clear motion diagnostics:', e);
  }
};

export const clearTimerDiagnosticsRing = async () => {
  try {
    await AsyncStorage.removeItem(TIMER_DIAGNOSTICS_RING_KEY);
  } catch (e) {
    console.error('Failed to clear timer diagnostics:', e);
  }
};
