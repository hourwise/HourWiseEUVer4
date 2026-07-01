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
  activeDrivingStillThresholdKmh: 1.5,
  lowSpeedStopThresholdKmh: 6,
  drivingThresholdKmh: 8,
  immediateStartThresholdKmh: 12,
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

test('processLocationMotionSample does not emit driving start below threshold', () => {
  const movingSinceMs = Date.UTC(2026, 4, 17, 9, 2, 0);
  const nowMs = movingSinceMs + 30000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 5,
    speedKmh: 5,
    isDriving: false,
    motionState: {
      ...createInitialMotionState(),
      movingSinceMs,
    },
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.motionState.drivingScore, 0);
});

test('processLocationMotionSample persists pending stationary evidence before stop confirmation', () => {
  const firstStopCandidateMs = Date.UTC(2026, 4, 17, 9, 10, 0);
  const result = processLocationMotionSample({
    nowMs: firstStopCandidateMs,
    accuracy: 12,
    speedKmh: 1,
    isDriving: true,
    motionState: {
      ...createInitialMotionState(),
      lastSpeedKmh: 18,
      lastSpeedTs: firstStopCandidateMs - 1000,
      drivingScore: 8,
    },
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.motionState.stationarySinceMs, firstStopCandidateMs);
  assert.equal(result.motionState.pendingTransitionType, 'stationary');
  assert.equal(result.motionState.pendingTransitionStartedAtMs, firstStopCandidateMs);
  assert.equal(result.motionState.lastLocationTs, firstStopCandidateMs);
  assert.equal(result.motionState.lastAccuracyM, 12);
});

test('processLocationMotionSample keeps crawling as active driving', () => {
  const previousMs = Date.UTC(2026, 4, 17, 9, 12, 0);
  const nowMs = previousMs + 20000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 8,
    speedKmh: 6,
    isDriving: true,
    motionState: {
      ...createInitialMotionState(),
      lastSpeedKmh: 12,
      lastSpeedTs: previousMs,
      stationarySinceMs: previousMs,
      drivingScore: 8,
    },
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.motionState.stationarySinceMs, 0);
  assert.equal(result.motionState.pendingTransitionType, null);
});

test('processLocationMotionSample does not resume recent driving below threshold', () => {
  const stoppedAtMs = Date.UTC(2026, 4, 17, 9, 14, 0);
  const movingSinceMs = stoppedAtMs + 30000;
  const nowMs = movingSinceMs + 7000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 8,
    speedKmh: 6,
    isDriving: false,
    motionState: {
      ...createInitialMotionState(),
      lastSpeedKmh: 0,
      lastSpeedTs: movingSinceMs,
      stationarySinceMs: stoppedAtMs,
      movingSinceMs,
      drivingScore: 0,
    },
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.drivingChangedAtMs, null);
  assert.equal(result.motionState.drivingScore, 0);
});

test('processLocationMotionSample computes speed when platform GPS speed is missing', () => {
  const previousMs = Date.UTC(2026, 4, 17, 9, 20, 0);
  const nowMs = previousMs + 4000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 8,
    speedKmh: null,
    latitude: 51.5003,
    longitude: -0.1000,
    isDriving: false,
    motionState: {
      ...createInitialMotionState(),
      lastLocationTs: previousMs,
      lastLatitude: 51.5000,
      lastLongitude: -0.1000,
      lastAccuracyM: 8,
    },
    config,
  });

  assert.equal(result.nextDriving, true);
  assert.equal(result.motionState.lastSelectedSpeedSource, 'computed');
  assert.ok((result.motionState.lastComputedSpeedKmh ?? 0) >= config.immediateStartThresholdKmh);
});

test('processLocationMotionSample computes speed when GPS speed is zero but distance changed', () => {
  const previousMs = Date.UTC(2026, 4, 17, 9, 25, 0);
  const nowMs = previousMs + 4000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 8,
    speedKmh: 0,
    latitude: 51.5003,
    longitude: -0.1000,
    isDriving: false,
    motionState: {
      ...createInitialMotionState(),
      lastLocationTs: previousMs,
      lastLatitude: 51.5000,
      lastLongitude: -0.1000,
      lastAccuracyM: 8,
    },
    config,
  });

  assert.equal(result.nextDriving, true);
  assert.equal(result.motionState.lastSelectedSpeedSource, 'computed');
});

test('processLocationMotionSample uses computed zero speed to avoid sticky GPS holding driving open', () => {
  const previousMs = Date.UTC(2026, 4, 17, 9, 30, 0);
  const nowMs = previousMs + 2000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 8,
    speedKmh: 80,
    latitude: 51.5000,
    longitude: -0.1000,
    isDriving: true,
    motionState: {
      ...createInitialMotionState(),
      lastLocationTs: previousMs,
      lastLatitude: 51.5000,
      lastLongitude: -0.1000,
      lastAccuracyM: 8,
      lastSpeedKmh: 80,
      lastSpeedTs: previousMs,
      drivingScore: 8,
    },
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.motionState.lastSpeedKmh, 0);
  assert.equal(result.motionState.lastSelectedSpeedSource, 'computed');
  assert.equal(result.motionState.pendingTransitionType, 'stationary');
});

test('processLocationMotionSample ignores implausible computed GPS jumps', () => {
  const previousMs = Date.UTC(2026, 4, 17, 9, 35, 0);
  const nowMs = previousMs + 1000;
  const result = processLocationMotionSample({
    nowMs,
    accuracy: 8,
    speedKmh: null,
    latitude: 52.5000,
    longitude: -0.1000,
    isDriving: false,
    motionState: {
      ...createInitialMotionState(),
      lastLocationTs: previousMs,
      lastLatitude: 51.5000,
      lastLongitude: -0.1000,
      lastAccuracyM: 8,
    },
    config,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.motionState.lastSelectedSpeedSource, 'none');
  assert.equal(result.motionState.lastComputedSpeedKmh, null);
  assert.equal(result.motionState.lastSpeedKmh, 0);
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
