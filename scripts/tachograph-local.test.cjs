const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const useWorkTimerSource = read('src/hooks/useWorkTimer.ts');
const complianceSource = read('src/lib/compliance.ts');
const reportSource = read('src/components/DownloadReportModal.tsx');
const dashboardSource = read('src/screens/Dashboard.tsx');
const indexSource = read('index.ts');
const displaySource = read('src/lib/tacho/display.ts');
const snapshotSource = read('src/lib/tacho/snapshot.ts');
const transitionsSource = read('src/lib/tacho/transitions.ts');
const sessionPayloadsSource = read('src/lib/tacho/sessionPayloads.ts');
const lifecycleSource = read('src/lib/tacho/lifecycle.ts');
const endShiftSource = read('src/lib/tacho/endShift.ts');
const drivingDetectionSource = read('src/lib/tacho/drivingDetection.ts');
const alertsSource = read('src/lib/tacho/alerts.ts');
const runtimeStorageSource = read('src/lib/tacho/runtimeStorage.ts');
const enSource = read('src/lib/i18n/en.json');

test('useWorkTimer keeps separate work and driving cycle counters', () => {
  assert.match(useWorkTimerSource, /const drivingCycleRef = useRef<number>\(0\)/);
  assert.match(useWorkTimerSource, /const workCycleRef = useRef<number>\(0\)/);
  assert.match(useWorkTimerSource, /const legalBreakDisplayTotalRef = useRef<number>\(0\)/);
  assert.match(useWorkTimerSource, /deriveLiveDisplayState\(/);
  assert.match(displaySource, /drivingTimeRemaining: maxDriveSeconds - nextDrivingCycle/);
  assert.match(displaySource, /workTimeRemaining: maxWork - nextWorkCycle/);
  assert.match(useWorkTimerSource, /let inFlightDriving = 0;/);
  assert.match(useWorkTimerSource, /if \(isDrivingRef\.current\) inFlightDriving = inFlightSec; else inFlightWork = inFlightSec;/);
});

test('qualifying breaks reset cycle counters but do not reset full totals', () => {
  assert.match(useWorkTimerSource, /workCycleRef\.current = transition\.nextWorkCycle;/);
  assert.match(useWorkTimerSource, /drivingCycleRef\.current = transition\.nextDrivingCycle;/);
  assert.match(transitionsSource, /nextWorkCycle = 0;/);
  assert.match(transitionsSource, /nextDrivingCycle = 0;/);
  assert.doesNotMatch(
    useWorkTimerSource,
    /totalsRef\.current\s*=\s*\{\s*\.\.\.totalsRef\.current,\s*work:\s*0,\s*driving:\s*0\s*\}/
  );
});

test('break qualification uses a stable break start timestamp', () => {
  assert.match(useWorkTimerSource, /const breakStartTimeRef = useRef<number>\(0\)/);
  assert.match(useWorkTimerSource, /breakStartTimeRef\.current = transition\.nextBreakStartMs;/);
  assert.match(snapshotSource, /const breakStartedMs = breakStartMs \|\| segmentStartMs/);
  assert.match(transitionsSource, /const breakStartedMs = breakStartMs \|\| segmentStartMs/);
});

test('refreshSession prefers fresher local session state over stale DB status', () => {
  assert.match(useWorkTimerSource, /const shouldPreferLocalState =/);
  assert.match(useWorkTimerSource, /localSessionId === data\.id/);
  assert.match(useWorkTimerSource, /const effectiveStatus = shouldPreferLocalState \? localStatus : \(data\.status as WorkStatus\)/);
  assert.match(useWorkTimerSource, /const effectiveTimerMode = shouldPreferLocalState \? localTimerMode : dbTimerMode/);
  assert.match(useWorkTimerSource, /const effectiveHas15minBreak = shouldPreferLocalState \? localHas15minBreak : dbHas15minBreak/);
});

test('dashboard break summary uses tachograph-style displayed break total, not raw break total', () => {
  assert.match(displaySource, /const completedLegalBreakDisplay =/);
  assert.match(displaySource, /legalBreak:\s+completedLegalBreakDisplay \+/);
  assert.match(displaySource, /getDisplayedBreakSeconds/);
  assert.match(useWorkTimerSource, /legalBreakDisplayTotalRef\.current \+= getDisplayedBreakSeconds\(transition\.lastBreakDuration\);/);
  assert.match(useWorkTimerSource, /legalBreakDisplayTotal: legalBreakDisplayTotalRef\.current,/);
  assert.match(dashboardSource, /formatBreakTime\(display\?\.legalBreak \?\? 0\)/);
  assert.doesNotMatch(dashboardSource, /formatBreakTime\(display\?\.break \?\? 0\)/);
});

test('dashboard break summary can recover for an older in-progress shift without stored legal break display', () => {
  assert.match(displaySource, /legalBreakDisplayTotal > 0/);
  assert.match(displaySource, /lastBreakDuration > 0/);
  assert.match(displaySource, /status !== 'break' && nextTotals\.break > 0/);
});

test('status and driving transitions are derived in pure helpers', () => {
  assert.match(useWorkTimerSource, /deriveDrivingTransition\(/);
  assert.match(useWorkTimerSource, /deriveStatusTransition\(/);
  assert.match(useWorkTimerSource, /getStatusTransitionAlertKey\(/);
  assert.match(transitionsSource, /export const deriveDrivingTransition =/);
  assert.match(transitionsSource, /export const deriveStatusTransition =/);
});

test('session update payloads are derived in pure helpers', () => {
  assert.match(useWorkTimerSource, /buildDriveStopUpdatePayload\(/);
  assert.match(useWorkTimerSource, /buildStatusUpdatePayload\(/);
  assert.match(useWorkTimerSource, /buildPeriodicCheckpointPayload\(/);
  assert.match(sessionPayloadsSource, /export const buildSessionOtherData =/);
  assert.match(sessionPayloadsSource, /timerMode,/);
  assert.match(sessionPayloadsSource, /export const buildDriveStopUpdatePayload =/);
  assert.match(sessionPayloadsSource, /export const buildStatusUpdatePayload =/);
  assert.match(sessionPayloadsSource, /export const buildPeriodicCheckpointPayload =/);
});

test('shift lifecycle presets are derived in pure helpers', () => {
  assert.match(useWorkTimerSource, /createInitialDisplayState\(/);
  assert.match(useWorkTimerSource, /createStartedShiftState\(/);
  assert.match(useWorkTimerSource, /createFailedStartRollbackState\(/);
  assert.match(useWorkTimerSource, /createEndedShiftResetState\(/);
  assert.match(lifecycleSource, /export const createInitialDisplayState =/);
  assert.match(lifecycleSource, /export const createStartedShiftState =/);
  assert.match(lifecycleSource, /export const createFailedStartRollbackState =/);
  assert.match(lifecycleSource, /export const createEndedShiftResetState =/);
});

test('shift lifecycle resets sensor and UI carry-over refs', () => {
  assert.match(lifecycleSource, /drivingScore: 0,/);
  assert.match(lifecycleSource, /stationarySinceMs: 0,/);
  assert.match(lifecycleSource, /lastSpeedKmh: 0,/);
  assert.match(lifecycleSource, /lastSpeedTs: 0,/);
  assert.match(lifecycleSource, /lastBreakDuration: 0,/);
  assert.match(lifecycleSource, /lastBreakEndTime: 0,/);
  assert.match(useWorkTimerSource, /drivingScoreRef\.current = startedShift\.drivingScore;/);
  assert.match(useWorkTimerSource, /lastBreakDurationUiRef\.current = endedShift\.lastBreakDuration;/);
  assert.match(useWorkTimerSource, /prevRemainingRef\.current = \{/);
});

test('end shift confirmation flow uses pure summary and request helpers', () => {
  assert.match(useWorkTimerSource, /buildEndShiftSummary\(/);
  assert.match(useWorkTimerSource, /buildEndSessionRequest\(/);
  assert.match(endShiftSource, /export const buildEndShiftSummary =/);
  assert.match(endShiftSource, /export const buildEndSessionRequest =/);
});

test('sensor driving detection decisions are derived in pure helpers', () => {
  assert.match(useWorkTimerSource, /evaluateBackgroundSpeedDecision\(/);
  assert.match(useWorkTimerSource, /evaluateLocationSample\(/);
  assert.match(useWorkTimerSource, /evaluateAccelerometerDecision\(/);
  assert.match(drivingDetectionSource, /export const evaluateBackgroundSpeedDecision =/);
  assert.match(drivingDetectionSource, /export const evaluateLocationSample =/);
  assert.match(drivingDetectionSource, /export const evaluateAccelerometerDecision =/);
});

test('end-shift teardown suppresses drive-stop sync writes', () => {
  assert.match(useWorkTimerSource, /const suppressDriveStopSyncRef = useRef<boolean>\(false\)/);
  assert.match(useWorkTimerSource, /if \(!suppressDriveStopSyncRef\.current && !nextDriving && sessionIdRef\.current && statusRef\.current === 'working'\)/);
  assert.match(useWorkTimerSource, /suppressDriveStopSyncRef\.current = true;/);
  assert.match(useWorkTimerSource, /suppressDriveStopSyncRef\.current = false;/);
});

test('work notifications use corrected message keys and text', () => {
  assert.match(alertsSource, /workWarn30mRemaining: \{ speechKey: 'audioWork30minLeft'/);
  assert.match(useWorkTimerSource, /scheduleAtThreshold\(remainingWork, 30 \* 60, 'workWarn30mRemaining'\)/);
  assert.match(useWorkTimerSource, /scheduleAtThreshold\(remainingWork, 15 \* 60, 'workWarn15mRemaining'\)/);
  assert.match(useWorkTimerSource, /saveScheduledComplianceNotificationIds\(scheduledComplianceIdsRef\.current\)/);
  assert.match(enSource, /"workTime5minLeft": "5 minutes remaining in your work cycle\."/);
  assert.match(enSource, /"audioWork30minLeft": "30 minutes remaining in your work cycle\."/);
  assert.doesNotMatch(enSource, /"workTime45minLeft":/);
});

test('scheduled work notifications are cancelled, persisted, and cleared across shift lifecycle changes', () => {
  assert.match(useWorkTimerSource, /const cancelScheduledComplianceNotifications = useCallback\(async \(isEndingShift = false\) => \{/);
  assert.match(useWorkTimerSource, /const persistedIds = await loadScheduledComplianceNotificationIds\(\)/);
  assert.match(useWorkTimerSource, /await clearScheduledComplianceNotificationIds\(\)/);
  assert.match(useWorkTimerSource, /await Notifications\.cancelAllScheduledNotificationsAsync\(\)/);
  assert.match(useWorkTimerSource, /await cancelScheduledComplianceNotifications\(\);/);
  assert.match(useWorkTimerSource, /await cancelScheduledComplianceNotifications\(true\);/);
  assert.match(runtimeStorageSource, /SCHEDULED_COMPLIANCE_NOTIFICATION_IDS_KEY/);
});

test('driving notifications are live and handled through active and background threshold crossing', () => {
  assert.doesNotMatch(useWorkTimerSource, /scheduleAtThreshold\(remainingDrive,/);
  assert.match(useWorkTimerSource, /if \(status === 'working' && isDriving\) \{/);
  assert.match(useWorkTimerSource, /const currentDriveExtension = MAX_DAILY_DRIVE_EXTENDED - display\.driving/);
  assert.match(indexSource, /alertKeys\.push\('driveCycleWarn30mRemaining'\)/);
  assert.match(indexSource, /alertKeys\.push\('driveExtensionWarn30mRemaining'\)/);
  assert.match(indexSource, /alertKeys\.push\('weeklyDriveWarn1hRemaining'\)/);
  assert.match(indexSource, /await scheduleBackgroundAlert\(alertKey\);/);
  assert.match(enSource, /"audioDrivingExtension30minLeft": "30 minutes remaining in your 10-hour driving extension\."/);
});

test('background speed task and hook use the same storage key', () => {
  assert.match(indexSource, /BACKGROUND_SPEED_KEY = 'bg_last_speed_v1'/);
  assert.match(useWorkTimerSource, /BG_SPEED_KEY/);
  assert.match(indexSource, /JSON\.stringify\(\{ speedKmh: speed, ts: nowMs \}\)/);
  assert.match(useWorkTimerSource, /const \{ speedKmh, ts \} = JSON\.parse\(raw\)/);
  assert.match(indexSource, /const persistedState = await loadActiveTimerState\(\)/);
  assert.match(indexSource, /await saveActiveTimerState\(persistedState\)/);
});

test('reports read driving time from other_data', () => {
  assert.match(reportSource, /s\.other_data\?\.driving \|\| s\.total_driving_minutes \|\| 0/);
});

test('compliance adds driving to total working time', () => {
  assert.match(complianceSource, /const workMins\s+=\s+\(s: any\): number => otherWorkMins\(s\) \+ driveMins\(s\)/);
});

test('compliance prefers stored driving cycle for continuous driving checks', () => {
  assert.match(complianceSource, /const continuousDriving = drivingCycleMins\(today\)/);
  assert.match(complianceSource, /continuousDriving > RULES\.MAX_CONTINUOUS_DRIVING_MINS/);
});

test('compliance prefers stored work cycle for WTD break checks', () => {
  assert.match(complianceSource, /const work\s+= workCycleMins\(today\) \?\? workMins\(today\)/);
});

test('implemented rule coverage remains explicitly limited', () => {
  const expectedKeys = [
    'EXCEEDED_4_5H_DRIVING',
    'EXCEEDED_DAILY_DRIVING_LIMIT',
    'EXCEEDED_WEEKLY_DRIVING_LIMIT',
    'FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED',
    'EXCEEDED_6H_WORK',
    'INSUFFICIENT_BREAK_FOR_9H_WORK',
    'EXCEEDED_WEEKLY_WORK_LIMIT',
    'WORK_TIME_LIMIT_EXCEEDED',
    'INSUFFICIENT_DAILY_REST',
    'REDUCED_DAILY_REST_TAKEN',
  ];

  for (const key of expectedKeys) {
    assert.match(complianceSource, new RegExp(key));
  }
});

test('source still lacks weekly rest logic, which the assessment flags as a gap', () => {
  assert.doesNotMatch(complianceSource, /WEEKLY_REST/);
  assert.doesNotMatch(complianceSource, /multi-?manning/i);
  assert.doesNotMatch(complianceSource, /ferry|train/i);
});
