export const BASE_STORAGE_KEY = 'timerState_v11';
export const LOCATION_TASK_NAME = 'background-location-task';
export const BG_SPEED_KEY = 'bg_last_speed_v1';

export const DRIVING_SPEED_THRESHOLD_KMH = 8;
export const DRIVING_IMMEDIATE_START_THRESHOLD_KMH = 12;
export const STILL_SPEED_THRESHOLD_KMH = 4;
export const LOW_SPEED_STOP_THRESHOLD_KMH = 4;
export const MOVING_CONFIRM_MS = 1200;
// Keep driving "sticky" through normal traffic pauses without lowering
// the start threshold enough for brisk walking to trigger.
export const STATIONARY_CONFIRM_MS = 3000;
export const GPS_STALE_THRESHOLD_MS = 10000;
export const MOTION_MAGNITUDE_THRESHOLD = 0.12;
export const ACCEL_SCORE_MAX = 8;
export const ACCEL_DRIVE_THRESHOLD = 4;
export const ACCEL_STOP_THRESHOLD = 1;

export const MAX_WORK_6H = 6 * 3600;
export const MAX_WORK_9H = 9 * 3600;
export const MAX_DRIVE = 4.5 * 3600;
export const MAX_DAILY_DRIVE_EXTENDED = 10 * 3600;
export const MAX_WEEKLY_DRIVE = 56 * 3600;
export const MAX_SHIFT_TIME_13H = 13 * 3600;
export const MAX_SHIFT_TIME_15H = 15 * 3600;
export const MAX_SHIFT_EXTENSIONS_PER_WEEK = 3;
export const MIN_DAILY_REST_REGULAR = 11 * 3600;
export const MIN_DAILY_REST_REDUCED = 9 * 3600;
// Alias for backward compatibility during transition
export const SPREADOVER_13H = MAX_SHIFT_TIME_13H;

export const TACHO_15_MIN = 15 * 60;
export const TACHO_30_MIN = 30 * 60;
export const TACHO_45_MIN = 45 * 60;
