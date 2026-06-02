import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateAccelerometerDecision,
  evaluateBackgroundSpeedDecision,
  evaluateLocationSample,
} from '../drivingDetection';

test('evaluateLocationSample starts driving after sustained movement above threshold', () => {
  const movingSinceMs = Date.UTC(2026, 4, 14, 9, 0, 0);
  const nowMs = movingSinceMs + 2000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 11,
    lastSpeedKmh: 8,
    lastSpeedTs: movingSinceMs,
    isDriving: false,
    movingSinceMs,
    stationarySinceMs: 0,
    stillThresholdKmh: 4,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, true);
  assert.equal(result.nextDrivingScore, 8);
});

test('evaluateLocationSample stops driving after stationary confirmation window', () => {
  const stationarySinceMs = Date.UTC(2026, 4, 14, 9, 30, 0);
  const nowMs = stationarySinceMs + 16000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 0,
    lastSpeedKmh: 12,
    lastSpeedTs: stationarySinceMs,
    isDriving: true,
    movingSinceMs: 0,
    stationarySinceMs,
    stillThresholdKmh: 4,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, false);
  assert.equal(result.nextDrivingScore, 0);
});

test('evaluateBackgroundSpeedDecision ignores stale background speed samples', () => {
  const result = evaluateBackgroundSpeedDecision({
    nowMs: 100000,
    sampleTs: 50000,
    speedKmh: 30,
    isDriving: false,
    drivingThresholdKmh: 10,
    stillThresholdKmh: 4,
    immediateStartThresholdKmh: 14,
    lowSpeedStopThresholdKmh: 6,
    staleThresholdMs: 10000,
  });

  assert.equal(result.shouldApply, false);
  assert.equal(result.nextDriving, null);
});

test('evaluateAccelerometerDecision falls back to motion score when GPS is stale', () => {
  const result = evaluateAccelerometerDecision({
    nowMs: 20000,
    x: 1.4,
    y: 0.8,
    z: 0.9,
    lastSpeedTs: 0,
    lastSpeedKmh: 0,
    currentDrivingScore: 3,
    isDriving: false,
    gpsStaleThresholdMs: 10000,
    drivingThresholdKmh: 10,
    stillThresholdKmh: 4,
    motionMagnitudeThreshold: 0.12,
    accelScoreMax: 8,
    accelDriveThreshold: 4,
    accelStopThreshold: 1,
  });

  assert.equal(result.shouldIgnore, false);
  assert.equal(result.nextDrivingScore, 4);
  assert.equal(result.nextDriving, false);
});
