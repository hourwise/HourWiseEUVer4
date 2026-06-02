import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialMotionState } from '../machine';
import {
  processAccelerometerMotionSample,
  processLocationMotionSample,
  type MotionDetectorConfig,
} from '../motionDetector';

const config: MotionDetectorConfig = {
  stillThresholdKmh: 4,
  lowSpeedStopThresholdKmh: 6,
  drivingThresholdKmh: 10,
  immediateStartThresholdKmh: 14,
  movingConfirmMs: 1200,
  stationaryConfirmMs: 15000,
  accelScoreMax: 8,
  gpsStaleThresholdMs: 10000,
  motionMagnitudeThreshold: 0.12,
  accelDriveThreshold: 4,
  accelStopThreshold: 1,
};

test('processLocationMotionSample updates motion state and emits driving start', () => {
  const nowMs = Date.UTC(2026, 4, 17, 9, 0, 2);
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 5,
    speedKmh: 11,
    isDriving: false,
    motionState: {
      ...createInitialMotionState(),
      movingSinceMs: Date.UTC(2026, 4, 17, 9, 0, 0),
    },
    config,
  });

  assert.equal(result.nextDriving, true);
  assert.equal(result.motionState.lastSpeedKmh, 11);
  assert.equal(result.motionState.lastSpeedTs, nowMs);
  assert.equal(result.motionState.drivingScore, 8);
});

test('processLocationMotionSample carries forward state when sample is ignored', () => {
  const motionState = {
    ...createInitialMotionState(),
    lastSpeedKmh: 9,
    lastSpeedTs: 123,
    movingSinceMs: 456,
  };
  const result = processLocationMotionSample({
    nowMs: 789,
    accuracy: 100,
    speedKmh: 20,
    isDriving: false,
    motionState,
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.deepEqual(result.motionState, motionState);
});

test('processAccelerometerMotionSample updates driving score and emits stop decision', () => {
  const result = processAccelerometerMotionSample({
    nowMs: 20000,
    x: 0.58,
    y: 0.58,
    z: 0.58,
    isDriving: true,
    motionState: {
      ...createInitialMotionState(),
      lastSpeedTs: 0,
      lastSpeedKmh: 0,
      drivingScore: 1,
    },
    config,
  });

  assert.equal(result.motionState.drivingScore, 0);
  assert.equal(result.nextDriving, false);
});
