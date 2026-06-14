import {
  evaluateAccelerometerDecision,
  evaluateLocationSample,
} from './drivingDetection';
import type { TachoMotionState } from './machine';

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_COMPUTED_SPEED_KMH = 130;
const MAX_COMPUTED_SPEED_ACCURACY_M = 50;
const MIN_COMPUTED_SPEED_ELAPSED_MS = 1000;
const MAX_COMPUTED_SPEED_ELAPSED_MS = 120_000;

const toRadians = (value: number): number => value * Math.PI / 180;

const isFiniteLatitude = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;

const isFiniteLongitude = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;

const hasAccurateLocation = (
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  accuracyM: number | null | undefined,
): boolean =>
  isFiniteLatitude(latitude) &&
  isFiniteLongitude(longitude) &&
  typeof accuracyM === 'number' &&
  Number.isFinite(accuracyM) &&
  accuracyM > 0 &&
  accuracyM <= MAX_COMPUTED_SPEED_ACCURACY_M;

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

const computeLocationSpeedKmh = ({
  nowMs,
  latitude,
  longitude,
  accuracy,
  motionState,
}: {
  nowMs: number;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  accuracy: number;
  motionState: TachoMotionState;
}): number | null => {
  if (
    !hasAccurateLocation(latitude, longitude, accuracy) ||
    !hasAccurateLocation(
      motionState.lastLatitude,
      motionState.lastLongitude,
      motionState.lastAccuracyM,
    )
  ) {
    return null;
  }
  if (
    !isFiniteLatitude(latitude) ||
    !isFiniteLongitude(longitude) ||
    !isFiniteLatitude(motionState.lastLatitude) ||
    !isFiniteLongitude(motionState.lastLongitude)
  ) {
    return null;
  }

  const elapsedMs = nowMs - motionState.lastLocationTs;
  if (
    elapsedMs < MIN_COMPUTED_SPEED_ELAPSED_MS ||
    elapsedMs > MAX_COMPUTED_SPEED_ELAPSED_MS
  ) {
    return null;
  }

  const distanceMeters = getDistanceMeters(
    motionState.lastLatitude,
    motionState.lastLongitude,
    latitude,
    longitude,
  );
  const computedSpeedKmh = distanceMeters / (elapsedMs / 1000) * 3.6;
  if (!Number.isFinite(computedSpeedKmh) || computedSpeedKmh > MAX_COMPUTED_SPEED_KMH) {
    return null;
  }

  return Math.max(0, computedSpeedKmh);
};

const getSelectedSpeed = ({
  gpsSpeedKmh,
  computedSpeedKmh,
  isDriving,
  config,
}: {
  gpsSpeedKmh: number | null;
  computedSpeedKmh: number | null;
  isDriving: boolean;
  config: MotionDetectorConfig;
}): {
  selectedSpeedKmh: number;
  selectedSpeedSource: TachoMotionState['lastSelectedSpeedSource'];
} => {
  const gpsSpeedIsUsable =
    typeof gpsSpeedKmh === 'number' &&
    Number.isFinite(gpsSpeedKmh) &&
    gpsSpeedKmh >= 0 &&
    gpsSpeedKmh <= MAX_COMPUTED_SPEED_KMH;

  if (computedSpeedKmh !== null) {
    if (!gpsSpeedIsUsable) {
      return { selectedSpeedKmh: computedSpeedKmh, selectedSpeedSource: 'computed' };
    }
    if (gpsSpeedKmh <= config.stillThresholdKmh && computedSpeedKmh >= config.drivingThresholdKmh) {
      return { selectedSpeedKmh: computedSpeedKmh, selectedSpeedSource: 'computed' };
    }
    if (isDriving && gpsSpeedKmh >= config.drivingThresholdKmh && computedSpeedKmh <= config.stillThresholdKmh) {
      return { selectedSpeedKmh: computedSpeedKmh, selectedSpeedSource: 'computed' };
    }
  }

  if (gpsSpeedIsUsable) {
    return { selectedSpeedKmh: gpsSpeedKmh, selectedSpeedSource: 'gps' };
  }

  return { selectedSpeedKmh: 0, selectedSpeedSource: 'none' };
};

const getPendingTransition = ({
  isDriving,
  movingSinceMs,
  stationarySinceMs,
}: {
  isDriving: boolean;
  movingSinceMs: number;
  stationarySinceMs: number;
}): Pick<TachoMotionState, 'pendingTransitionType' | 'pendingTransitionStartedAtMs'> => {
  if (isDriving && stationarySinceMs > 0) {
    return {
      pendingTransitionType: 'stationary',
      pendingTransitionStartedAtMs: stationarySinceMs,
    };
  }

  if (!isDriving && movingSinceMs > 0) {
    return {
      pendingTransitionType: 'moving',
      pendingTransitionStartedAtMs: movingSinceMs,
    };
  }

  return {
    pendingTransitionType: null,
    pendingTransitionStartedAtMs: 0,
  };
};

export type MotionDetectorConfig = {
  stillThresholdKmh: number;
  lowSpeedStopThresholdKmh: number;
  drivingThresholdKmh: number;
  immediateStartThresholdKmh: number;
  movingConfirmMs: number;
  stationaryConfirmMs: number;
  accelScoreMax: number;
  gpsStaleThresholdMs: number;
  motionMagnitudeThreshold: number;
  accelDriveThreshold: number;
  accelStopThreshold: number;
};

export type LocationMotionSampleInput = {
  nowMs: number;
  accuracy: number;
  speedKmh: number | null;
  latitude?: number | null;
  longitude?: number | null;
  isDriving: boolean;
  motionState: TachoMotionState;
  config: MotionDetectorConfig;
};

export type AccelerometerMotionSampleInput = {
  nowMs: number;
  x: number;
  y: number;
  z: number;
  isDriving: boolean;
  motionState: TachoMotionState;
  config: MotionDetectorConfig;
};

export type MotionSampleResult = {
  motionState: TachoMotionState;
  nextDriving: boolean | null;
  drivingChangedAtMs: number | null;
  diagnostic: {
    gpsSpeedKmh: number | null;
    computedSpeedKmh: number | null;
    selectedSpeedKmh: number | null;
    selectedSpeedSource: TachoMotionState['lastSelectedSpeedSource'] | 'accelerometer';
    accuracyM: number | null;
    ignoredReason: string | null;
  };
};

export const processLocationMotionSample = ({
  nowMs,
  accuracy,
  speedKmh,
  latitude,
  longitude,
  isDriving,
  motionState,
  config,
}: LocationMotionSampleInput): MotionSampleResult => {
  const computedSpeedKmh = computeLocationSpeedKmh({
    nowMs,
    latitude,
    longitude,
    accuracy,
    motionState,
  });
  const { selectedSpeedKmh, selectedSpeedSource } = getSelectedSpeed({
    gpsSpeedKmh: speedKmh,
    computedSpeedKmh,
    isDriving,
    config,
  });
  const decision = evaluateLocationSample({
    nowMs,
    accuracy,
    speedKmh: selectedSpeedKmh,
    lastSpeedKmh: motionState.lastSpeedKmh,
    lastSpeedTs: motionState.lastSpeedTs,
    isDriving,
    movingSinceMs: motionState.movingSinceMs,
    stationarySinceMs: motionState.stationarySinceMs,
    stillThresholdKmh: config.stillThresholdKmh,
    lowSpeedStopThresholdKmh: config.lowSpeedStopThresholdKmh,
    drivingThresholdKmh: config.drivingThresholdKmh,
    immediateStartThresholdKmh: config.immediateStartThresholdKmh,
    movingConfirmMs: config.movingConfirmMs,
    stationaryConfirmMs: config.stationaryConfirmMs,
    accelScoreMax: config.accelScoreMax,
  });

  if (decision.shouldIgnore) {
    return {
      motionState,
      nextDriving: null,
      drivingChangedAtMs: null,
      diagnostic: {
        gpsSpeedKmh: speedKmh,
        computedSpeedKmh,
        selectedSpeedKmh,
        selectedSpeedSource,
        accuracyM: accuracy,
        ignoredReason: 'accuracy',
      },
    };
  }

  return {
    motionState: {
      ...motionState,
      lastSpeedKmh: decision.lastSpeedKmh,
      lastSpeedTs: decision.lastSpeedTs,
      lastLocationTs: nowMs,
      lastLatitude: isFiniteLatitude(latitude) ? latitude : motionState.lastLatitude,
      lastLongitude: isFiniteLongitude(longitude) ? longitude : motionState.lastLongitude,
      lastAccuracyM: accuracy,
      lastComputedSpeedKmh: computedSpeedKmh,
      lastSelectedSpeedSource: selectedSpeedSource,
      drivingScore:
        decision.nextDrivingScore !== null
          ? decision.nextDrivingScore
          : motionState.drivingScore,
      movingSinceMs: decision.nextMovingSinceMs,
      stationarySinceMs: decision.nextStationarySinceMs,
      ...getPendingTransition({
        isDriving,
        movingSinceMs: decision.nextMovingSinceMs,
        stationarySinceMs: decision.nextStationarySinceMs,
      }),
    },
    nextDriving: decision.nextDriving,
    drivingChangedAtMs: decision.drivingChangedAtMs,
    diagnostic: {
      gpsSpeedKmh: speedKmh,
      computedSpeedKmh,
      selectedSpeedKmh,
      selectedSpeedSource,
      accuracyM: accuracy,
      ignoredReason: null,
    },
  };
};

export const processAccelerometerMotionSample = ({
  nowMs,
  x,
  y,
  z,
  isDriving,
  motionState,
  config,
}: AccelerometerMotionSampleInput): MotionSampleResult => {
  const decision = evaluateAccelerometerDecision({
    nowMs,
    x,
    y,
    z,
    lastSpeedTs: motionState.lastSpeedTs,
    lastSpeedKmh: motionState.lastSpeedKmh,
    currentDrivingScore: motionState.drivingScore,
    isDriving,
    gpsStaleThresholdMs: config.gpsStaleThresholdMs,
    drivingThresholdKmh: config.drivingThresholdKmh,
    stillThresholdKmh: config.stillThresholdKmh,
    motionMagnitudeThreshold: config.motionMagnitudeThreshold,
    accelScoreMax: config.accelScoreMax,
    accelDriveThreshold: config.accelDriveThreshold,
    accelStopThreshold: config.accelStopThreshold,
  });

  if (decision.shouldIgnore) {
    return {
      motionState,
      nextDriving: null,
      drivingChangedAtMs: null,
      diagnostic: {
        gpsSpeedKmh: motionState.lastSpeedKmh,
        computedSpeedKmh: motionState.lastComputedSpeedKmh,
        selectedSpeedKmh: null,
        selectedSpeedSource: 'accelerometer',
        accuracyM: motionState.lastAccuracyM,
        ignoredReason: 'fresh_gps',
      },
    };
  }

  return {
    motionState: {
      ...motionState,
      drivingScore: decision.nextDrivingScore,
    },
    nextDriving: decision.nextDriving === isDriving ? null : decision.nextDriving,
    drivingChangedAtMs:
      decision.nextDriving === isDriving ? null : decision.drivingChangedAtMs,
    diagnostic: {
      gpsSpeedKmh: motionState.lastSpeedKmh,
      computedSpeedKmh: motionState.lastComputedSpeedKmh,
      selectedSpeedKmh: null,
      selectedSpeedSource: 'accelerometer',
      accuracyM: motionState.lastAccuracyM,
      ignoredReason: null,
    },
  };
};
