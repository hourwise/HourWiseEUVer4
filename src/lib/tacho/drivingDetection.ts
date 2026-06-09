import type {
  AccelerometerDecision,
  AccelerometerDecisionInput,
  BackgroundSpeedDecision,
  BackgroundSpeedDecisionInput,
  LocationSampleDecision,
  LocationSampleDecisionInput,
} from './types';

const MAX_LOCATION_ACCURACY_METERS = 50;
const MAX_STOP_LOCATION_ACCURACY_METERS = 75;

export const evaluateBackgroundSpeedDecision = ({
  nowMs,
  sampleTs,
  speedKmh,
  isDriving,
  drivingThresholdKmh,
  stillThresholdKmh,
  immediateStartThresholdKmh,
  lowSpeedStopThresholdKmh,
  staleThresholdMs,
}: BackgroundSpeedDecisionInput): BackgroundSpeedDecision => {
  if (nowMs - sampleTs > staleThresholdMs) {
    return { shouldApply: false, nextDriving: null };
  }

  const effectiveStartThreshold = Math.max(
    drivingThresholdKmh,
    immediateStartThresholdKmh
  );

  if (speedKmh >= effectiveStartThreshold && !isDriving) {
    return { shouldApply: true, nextDriving: true };
  }

  // On resume, a single low-speed sample from crawling traffic should not
  // immediately drop an active driving segment. Only stop if the sample is
  // clearly still; the live location stream can make the more nuanced call.
  if (speedKmh <= stillThresholdKmh && isDriving) {
    return { shouldApply: true, nextDriving: false };
  }

  return { shouldApply: false, nextDriving: null };
};

export const evaluateLocationSample = ({
  nowMs,
  accuracy,
  speedKmh,
  lastSpeedKmh,
  lastSpeedTs,
  isDriving,
  movingSinceMs,
  stationarySinceMs,
  stillThresholdKmh,
  lowSpeedStopThresholdKmh,
  drivingThresholdKmh,
  immediateStartThresholdKmh,
  movingConfirmMs,
  stationaryConfirmMs,
  accelScoreMax,
}: LocationSampleDecisionInput): LocationSampleDecision => {
  const maxAllowedAccuracy = isDriving
    ? MAX_STOP_LOCATION_ACCURACY_METERS
    : MAX_LOCATION_ACCURACY_METERS;

  if (accuracy > maxAllowedAccuracy) {
    return {
      shouldIgnore: true,
      nextDriving: null,
      nextMovingSinceMs: movingSinceMs,
      nextStationarySinceMs: stationarySinceMs,
      nextDrivingScore: null,
      lastSpeedKmh,
      lastSpeedTs,
    };
  }

  const stopCandidateThreshold = Math.max(stillThresholdKmh, lowSpeedStopThresholdKmh);
  const isStopCandidate = isDriving && speedKmh <= stopCandidateThreshold;
  const isClearlyStill = speedKmh <= stillThresholdKmh;

  if (isClearlyStill || isStopCandidate) {
    const nextStationarySinceMs = stationarySinceMs === 0 ? nowMs : stationarySinceMs;
    const shouldStop = isDriving && nowMs - nextStationarySinceMs >= stationaryConfirmMs;
    return {
      shouldIgnore: false,
      nextDriving: shouldStop ? false : null,
      nextMovingSinceMs: 0,
      nextStationarySinceMs,
      nextDrivingScore: shouldStop ? 0 : null,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: nowMs,
    };
  }

  if (!isDriving && speedKmh >= immediateStartThresholdKmh) {
    return {
      shouldIgnore: false,
      nextDriving: true,
      nextMovingSinceMs: 0,
      nextStationarySinceMs: 0,
      nextDrivingScore: accelScoreMax,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: nowMs,
    };
  }

  if (!isDriving && speedKmh >= drivingThresholdKmh) {
    const nextMovingSinceMs = movingSinceMs === 0 ? nowMs : movingSinceMs;
    const shouldStart = nowMs - nextMovingSinceMs >= movingConfirmMs;
    return {
      shouldIgnore: false,
      nextDriving: shouldStart ? true : null,
      nextMovingSinceMs: shouldStart ? 0 : nextMovingSinceMs,
      nextStationarySinceMs: 0,
      nextDrivingScore: shouldStart ? accelScoreMax : null,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: nowMs,
    };
  }

  return {
    shouldIgnore: false,
    nextDriving: null,
    nextMovingSinceMs: 0,
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

  const canStartFromAccel =
    gpsIsFresh && lastSpeedKmh >= Math.max(stillThresholdKmh + 2, drivingThresholdKmh - 2);

  const nextDriving =
    nextDrivingScore >= accelDriveThreshold && (isDriving || canStartFromAccel)
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
