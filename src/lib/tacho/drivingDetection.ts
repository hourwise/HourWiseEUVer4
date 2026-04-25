import type {
  AccelerometerDecision,
  AccelerometerDecisionInput,
  BackgroundSpeedDecision,
  BackgroundSpeedDecisionInput,
  LocationSampleDecision,
  LocationSampleDecisionInput,
} from './types';

const MAX_LOCATION_ACCURACY_METERS = 50;

export const evaluateBackgroundSpeedDecision = ({
  nowMs,
  sampleTs,
  speedKmh,
  isDriving,
  drivingThresholdKmh,
  stillThresholdKmh,
  staleThresholdMs,
}: BackgroundSpeedDecisionInput): BackgroundSpeedDecision => {
  if (nowMs - sampleTs > staleThresholdMs) {
    return { shouldApply: false, nextDriving: null };
  }

  if (speedKmh >= drivingThresholdKmh && !isDriving) {
    return { shouldApply: true, nextDriving: true };
  }

  if (speedKmh <= stillThresholdKmh && isDriving) {
    return { shouldApply: true, nextDriving: false };
  }

  return { shouldApply: false, nextDriving: null };
};

export const evaluateLocationSample = ({
  nowMs,
  accuracy,
  speedKmh,
  isDriving,
  stationarySinceMs,
  stillThresholdKmh,
  drivingThresholdKmh,
  stationaryConfirmMs,
  accelScoreMax,
}: LocationSampleDecisionInput): LocationSampleDecision => {
  if (accuracy > MAX_LOCATION_ACCURACY_METERS) {
    return {
      shouldIgnore: true,
      nextDriving: null,
      nextStationarySinceMs: stationarySinceMs,
      nextDrivingScore: null,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: nowMs,
    };
  }

  if (speedKmh <= stillThresholdKmh) {
    const nextStationarySinceMs = stationarySinceMs === 0 ? nowMs : stationarySinceMs;
    const shouldStop = isDriving && nowMs - nextStationarySinceMs >= stationaryConfirmMs;
    return {
      shouldIgnore: false,
      nextDriving: shouldStop ? false : null,
      nextStationarySinceMs,
      nextDrivingScore: shouldStop ? 0 : null,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: nowMs,
    };
  }

  if (speedKmh >= drivingThresholdKmh && !isDriving) {
    return {
      shouldIgnore: false,
      nextDriving: true,
      nextStationarySinceMs: 0,
      nextDrivingScore: accelScoreMax,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: nowMs,
    };
  }

  return {
    shouldIgnore: false,
    nextDriving: null,
    nextStationarySinceMs: 0,
    nextDrivingScore: null,
    lastSpeedKmh: speedKmh,
    lastSpeedTs: nowMs,
  };
};

export const evaluateAccelerometerDecision = ({
  nowMs,
  x,
  y,
  z,
  lastSpeedTs,
  lastSpeedKmh,
  currentDrivingScore,
  isDriving,
  gpsStaleThresholdMs,
  drivingThresholdKmh,
  stillThresholdKmh,
  motionMagnitudeThreshold,
  accelScoreMax,
  accelDriveThreshold,
  accelStopThreshold,
}: AccelerometerDecisionInput): AccelerometerDecision => {
  const gpsAge = nowMs - (lastSpeedTs || 0);
  const gpsIsFresh = gpsAge < gpsStaleThresholdMs;
  if (gpsIsFresh && lastSpeedKmh >= drivingThresholdKmh) {
    return {
      shouldIgnore: true,
      nextDrivingScore: currentDrivingScore,
      nextDriving: isDriving,
    };
  }
  if (gpsIsFresh && lastSpeedKmh <= stillThresholdKmh) {
    return {
      shouldIgnore: true,
      nextDrivingScore: currentDrivingScore,
      nextDriving: isDriving,
    };
  }

  const motion = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
  const isMoving = motion > motionMagnitudeThreshold;
  let nextDrivingScore = currentDrivingScore;
  if (isMoving && (!gpsIsFresh || lastSpeedKmh > stillThresholdKmh)) {
    nextDrivingScore = Math.min(accelScoreMax, nextDrivingScore + 1);
  } else {
    nextDrivingScore = Math.max(0, nextDrivingScore - 1);
  }

  const nextDriving =
    nextDrivingScore >= accelDriveThreshold
      ? true
      : nextDrivingScore <= accelStopThreshold
        ? false
        : isDriving;

  return {
    shouldIgnore: false,
    nextDrivingScore,
    nextDriving,
  };
};
