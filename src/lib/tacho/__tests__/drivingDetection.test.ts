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
  assert.equal(result.drivingChangedAtMs, stationarySinceMs);
});

test('evaluateLocationSample keeps active driving through low-speed crawling', () => {
  const stationarySinceMs = Date.UTC(2026, 4, 14, 9, 35, 0);
  const nowMs = stationarySinceMs + 16000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 3,
    lastSpeedKmh: 12,
    lastSpeedTs: stationarySinceMs,
    isDriving: true,
    movingSinceMs: 0,
    stationarySinceMs,
    stillThresholdKmh: 4,
    activeDrivingStillThresholdKmh: 1.5,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.nextStationarySinceMs, 0);
});

test('evaluateLocationSample does not start driving from movement below threshold', () => {
  const movingSinceMs = Date.UTC(2026, 4, 14, 9, 5, 0);
  const nowMs = movingSinceMs + 30000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 5,
    lastSpeedKmh: 5,
    lastSpeedTs: movingSinceMs,
    isDriving: false,
    movingSinceMs,
    stationarySinceMs: 0,
    stillThresholdKmh: 4,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 8,
    immediateStartThresholdKmh: 12,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.nextDrivingScore, null);
});

test('evaluateLocationSample still stops active driving when clearly still', () => {
  const stationarySinceMs = Date.UTC(2026, 4, 14, 9, 36, 0);
  const nowMs = stationarySinceMs + 16000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 1,
    lastSpeedKmh: 12,
    lastSpeedTs: stationarySinceMs,
    isDriving: true,
    movingSinceMs: 0,
    stationarySinceMs,
    stillThresholdKmh: 4,
    activeDrivingStillThresholdKmh: 1.5,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, false);
  assert.equal(result.drivingChangedAtMs, stationarySinceMs);
});

test('evaluateLocationSample does not restart below threshold after a recent driving stop', () => {
  const stoppedAtMs = Date.UTC(2026, 4, 14, 9, 40, 0);
  const movingSinceMs = stoppedAtMs + 30000;
  const nowMs = movingSinceMs + 7000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 3,
    lastSpeedKmh: 0,
    lastSpeedTs: movingSinceMs,
    isDriving: false,
    movingSinceMs,
    stationarySinceMs: stoppedAtMs,
    stillThresholdKmh: 4,
    activeDrivingStillThresholdKmh: 1.5,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, null);
  assert.equal(result.drivingChangedAtMs, null);
});

test('evaluateLocationSample does not low-speed start without recent driving context', () => {
  const movingSinceMs = Date.UTC(2026, 4, 14, 9, 50, 0);
  const nowMs = movingSinceMs + 7000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 5,
    speedKmh: 3,
    lastSpeedKmh: 0,
    lastSpeedTs: movingSinceMs,
    isDriving: false,
    movingSinceMs,
    stationarySinceMs: 0,
    stillThresholdKmh: 4,
    activeDrivingStillThresholdKmh: 1.5,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 15000,
    accelScoreMax: 8,
  });

  assert.equal(result.nextDriving, null);
});

test('evaluateLocationSample accepts slightly weaker GPS accuracy for stop decisions', () => {
  const stationarySinceMs = Date.UTC(2026, 4, 14, 9, 45, 0);
  const nowMs = stationarySinceMs + 2000;
  const result = evaluateLocationSample({
    nowMs,
    accuracy: 70,
    speedKmh: 3,
    lastSpeedKmh: 10,
    lastSpeedTs: stationarySinceMs,
    isDriving: true,
    movingSinceMs: 0,
    stationarySinceMs,
    stillThresholdKmh: 4,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 1800,
    accelScoreMax: 8,
  });

  assert.equal(result.shouldIgnore, false);
  assert.equal(result.nextDriving, false);
  assert.equal(result.drivingChangedAtMs, stationarySinceMs);
});

test('evaluateLocationSample still ignores weak GPS accuracy for driving start decisions', () => {
  const result = evaluateLocationSample({
    nowMs: Date.UTC(2026, 4, 14, 10, 0, 0),
    accuracy: 70,
    speedKmh: 20,
    lastSpeedKmh: 0,
    lastSpeedTs: 0,
    isDriving: false,
    movingSinceMs: 0,
    stationarySinceMs: 0,
    stillThresholdKmh: 4,
    lowSpeedStopThresholdKmh: 6,
    drivingThresholdKmh: 10,
    immediateStartThresholdKmh: 14,
    movingConfirmMs: 1200,
    stationaryConfirmMs: 1800,
    accelScoreMax: 8,
  });

  assert.equal(result.shouldIgnore, true);
  assert.equal(result.nextDriving, null);
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
