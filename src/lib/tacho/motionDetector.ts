import {
  evaluateAccelerometerDecision,
  evaluateLocationSample,
} from './drivingDetection';
import type { TachoMotionState } from './machine';

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
  speedKmh: number;
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
};

export const processLocationMotionSample = ({
  nowMs,
  accuracy,
  speedKmh,
  isDriving,
  motionState,
  config,
}: LocationMotionSampleInput): MotionSampleResult => {
  const decision = evaluateLocationSample({
    nowMs,
    accuracy,
    speedKmh,
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
    return { motionState, nextDriving: null };
  }

  return {
    motionState: {
      lastSpeedKmh: decision.lastSpeedKmh,
      lastSpeedTs: decision.lastSpeedTs,
      drivingScore:
        decision.nextDrivingScore !== null
          ? decision.nextDrivingScore
          : motionState.drivingScore,
      movingSinceMs: decision.nextMovingSinceMs,
      stationarySinceMs: decision.nextStationarySinceMs,
    },
    nextDriving: decision.nextDriving,
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
    return { motionState, nextDriving: null };
  }

  return {
    motionState: {
      ...motionState,
      drivingScore: decision.nextDrivingScore,
    },
    nextDriving: decision.nextDriving === isDriving ? null : decision.nextDriving,
  };
};
