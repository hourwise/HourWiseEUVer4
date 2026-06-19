const EARTH_RADIUS_METERS = 6_371_000;

export const LOW_SPEED_START_THRESHOLD_KMH = 1;
export const LOW_SPEED_UPPER_LIMIT_KMH = 8;
export const LOW_SPEED_CONFIRM_MS = 20_000;
export const LOW_SPEED_MIN_DISTANCE_METERS = 15;

const LOW_SPEED_MAX_ACCURACY_M = 35;
const LOW_SPEED_MAX_SAMPLE_GAP_MS = 30_000;
const WALKING_STEP_WINDOW_MS = 10_000;
const WALKING_STEP_MIN_COUNT = 4;
const MOTION_SENSOR_STALE_MS = 5_000;
const STEP_MIN_INTERVAL_MS = 300;
const STEP_MAX_INTERVAL_MS = 1800;
const STEP_ACCEL_DELTA = 0.08;
const STEP_ACCEL_MIN_MOTION = 0.10;

export type LowSpeedYardDetectorState = {
  candidateStartedAtMs: number;
  candidateStartLatitude: number | null;
  candidateStartLongitude: number | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAtMs: number;
  distanceMeters: number;
  lastAccelerometerAtMs: number;
  lastAccelMotion: number | null;
  lastStepAtMs: number;
  recentStepTimesMs: number[];
};

export type LowSpeedYardLocationResult = {
  state: LowSpeedYardDetectorState;
  shouldStartDriving: boolean;
  drivingStartedAtMs: number | null;
  reason: string | null;
};

export const createInitialLowSpeedYardDetectorState = (): LowSpeedYardDetectorState => ({
  candidateStartedAtMs: 0,
  candidateStartLatitude: null,
  candidateStartLongitude: null,
  lastLatitude: null,
  lastLongitude: null,
  lastLocationAtMs: 0,
  distanceMeters: 0,
  lastAccelerometerAtMs: 0,
  lastAccelMotion: null,
  lastStepAtMs: 0,
  recentStepTimesMs: [],
});

const toRadians = (value: number): number => value * Math.PI / 180;

const isFiniteLatitude = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;

const isFiniteLongitude = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;

const getDistanceMeters = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number => {
  const dLat = toRadians(toLatitude - fromLatitude);
  const dLon = toRadians(toLongitude - fromLongitude);
  const fromLatRad = toRadians(fromLatitude);
  const toLatRad = toRadians(toLatitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const hasAccurateLocation = (
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  accuracyM: number,
) =>
  isFiniteLatitude(latitude) &&
  isFiniteLongitude(longitude) &&
  Number.isFinite(accuracyM) &&
  accuracyM > 0 &&
  accuracyM <= LOW_SPEED_MAX_ACCURACY_M;

const pruneStepTimes = (stepTimes: number[], nowMs: number) =>
  stepTimes.filter(stepAtMs => nowMs - stepAtMs <= WALKING_STEP_WINDOW_MS);

export const isWalkingLikely = (
  state: LowSpeedYardDetectorState,
  nowMs: number,
) => pruneStepTimes(state.recentStepTimesMs, nowMs).length >= WALKING_STEP_MIN_COUNT;

const hasFreshMotionSensorSample = (
  state: LowSpeedYardDetectorState,
  nowMs: number,
) => state.lastAccelerometerAtMs > 0 && nowMs - state.lastAccelerometerAtMs <= MOTION_SENSOR_STALE_MS;

export const processLowSpeedYardAccelerometerSample = ({
  nowMs,
  x,
  y,
  z,
  state,
}: {
  nowMs: number;
  x: number;
  y: number;
  z: number;
  state: LowSpeedYardDetectorState;
}): LowSpeedYardDetectorState => {
  const accelMagnitude = Math.sqrt(x * x + y * y + z * z);
  const motion = Math.abs(accelMagnitude - 1);
  const previousMotion = state.lastAccelMotion;
  const delta = previousMotion === null ? 0 : motion - previousMotion;
  const enoughTimeSinceStep =
    !state.lastStepAtMs || nowMs - state.lastStepAtMs >= STEP_MIN_INTERVAL_MS;
  const plausibleStepInterval =
    !state.lastStepAtMs || nowMs - state.lastStepAtMs <= STEP_MAX_INTERVAL_MS;
  const isStepLike =
    motion >= STEP_ACCEL_MIN_MOTION &&
    delta >= STEP_ACCEL_DELTA &&
    enoughTimeSinceStep &&
    plausibleStepInterval;
  const recentStepTimesMs = pruneStepTimes(
    isStepLike ? [...state.recentStepTimesMs, nowMs] : state.recentStepTimesMs,
    nowMs,
  );

  return {
    ...state,
    lastAccelerometerAtMs: nowMs,
    lastAccelMotion: motion,
    lastStepAtMs: isStepLike ? nowMs : state.lastStepAtMs,
    recentStepTimesMs,
  };
};

export const processLowSpeedYardLocationSample = ({
  nowMs,
  speedKmh,
  latitude,
  longitude,
  accuracyM,
  isDriving,
  state,
}: {
  nowMs: number;
  speedKmh: number | null;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  accuracyM: number;
  isDriving: boolean;
  state: LowSpeedYardDetectorState;
}): LowSpeedYardLocationResult => {
  if (isDriving) {
    return {
      state: createInitialLowSpeedYardDetectorState(),
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: 'already_driving',
    };
  }

  if (!hasAccurateLocation(latitude, longitude, accuracyM)) {
    return {
      state,
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: 'accuracy',
    };
  }

  if (
    speedKmh === null ||
    !Number.isFinite(speedKmh) ||
    speedKmh < LOW_SPEED_START_THRESHOLD_KMH ||
    speedKmh >= LOW_SPEED_UPPER_LIMIT_KMH
  ) {
    return {
      state: {
        ...createInitialLowSpeedYardDetectorState(),
        recentStepTimesMs: pruneStepTimes(state.recentStepTimesMs, nowMs),
        lastAccelerometerAtMs: state.lastAccelerometerAtMs,
        lastAccelMotion: state.lastAccelMotion,
        lastStepAtMs: state.lastStepAtMs,
      },
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: speedKmh !== null && speedKmh >= LOW_SPEED_UPPER_LIMIT_KMH
        ? 'handoff_normal_detector'
        : 'outside_low_speed_range',
    };
  }

  const currentLatitude = latitude as number;
  const currentLongitude = longitude as number;
  const sampleGapMs = state.lastLocationAtMs ? nowMs - state.lastLocationAtMs : 0;
  const shouldStartNewCandidate =
    !state.candidateStartedAtMs ||
    sampleGapMs > LOW_SPEED_MAX_SAMPLE_GAP_MS;
  const candidateStartedAtMs = shouldStartNewCandidate
    ? nowMs
    : state.candidateStartedAtMs;
  const candidateStartLatitude = shouldStartNewCandidate
    ? currentLatitude
    : state.candidateStartLatitude;
  const candidateStartLongitude = shouldStartNewCandidate
    ? currentLongitude
    : state.candidateStartLongitude;
  const incrementalDistance =
    !shouldStartNewCandidate &&
    isFiniteLatitude(state.lastLatitude) &&
    isFiniteLongitude(state.lastLongitude)
      ? getDistanceMeters(
          state.lastLatitude,
          state.lastLongitude,
          currentLatitude,
          currentLongitude,
        )
      : 0;
  const distanceFromStart =
    isFiniteLatitude(candidateStartLatitude) &&
    isFiniteLongitude(candidateStartLongitude)
      ? getDistanceMeters(
          candidateStartLatitude,
          candidateStartLongitude,
          currentLatitude,
          currentLongitude,
        )
      : 0;
  const distanceMeters = Math.max(
    shouldStartNewCandidate
      ? 0
      : state.distanceMeters + Math.max(0, incrementalDistance),
    distanceFromStart,
  );
  const nextState: LowSpeedYardDetectorState = {
    ...state,
    candidateStartedAtMs,
    candidateStartLatitude,
    candidateStartLongitude,
    lastLatitude: currentLatitude,
    lastLongitude: currentLongitude,
    lastLocationAtMs: nowMs,
    distanceMeters,
    recentStepTimesMs: pruneStepTimes(state.recentStepTimesMs, nowMs),
  };
  const movementDurationMs = nowMs - candidateStartedAtMs;

  if (isWalkingLikely(nextState, nowMs)) {
    return {
      state: nextState,
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: 'walking_likely',
    };
  }

  if (!hasFreshMotionSensorSample(nextState, nowMs)) {
    return {
      state: nextState,
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: 'motion_sensor_stale',
    };
  }

  if (movementDurationMs < LOW_SPEED_CONFIRM_MS) {
    return {
      state: nextState,
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: 'confirming_duration',
    };
  }

  if (distanceMeters < LOW_SPEED_MIN_DISTANCE_METERS) {
    return {
      state: nextState,
      shouldStartDriving: false,
      drivingStartedAtMs: null,
      reason: 'confirming_distance',
    };
  }

  return {
    state: nextState,
    shouldStartDriving: true,
    drivingStartedAtMs: candidateStartedAtMs,
    reason: 'confirmed_low_speed_vehicle_movement',
  };
};
