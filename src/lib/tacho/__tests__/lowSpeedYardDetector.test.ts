import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialLowSpeedYardDetectorState,
  processLowSpeedYardAccelerometerSample,
  processLowSpeedYardLocationSample,
} from '../lowSpeedYardDetector';

const startMs = Date.UTC(2026, 5, 16, 9, 0, 0);

const locationSample = ({
  offsetMs,
  latitude,
  speedKmh = 3,
  state,
}: {
  offsetMs: number;
  latitude: number;
  speedKmh?: number;
  state: ReturnType<typeof createInitialLowSpeedYardDetectorState>;
}) =>
  processLowSpeedYardLocationSample({
    nowMs: startMs + offsetMs,
    speedKmh,
    latitude,
    longitude: -0.1,
    accuracyM: 5,
    isDriving: false,
    state,
  });

const motionSensorSample = ({
  offsetMs,
  state,
  x = 0,
  y = 0,
  z = 1,
}: {
  offsetMs: number;
  state: ReturnType<typeof createInitialLowSpeedYardDetectorState>;
  x?: number;
  y?: number;
  z?: number;
}) =>
  processLowSpeedYardAccelerometerSample({
    nowMs: startMs + offsetMs,
    x,
    y,
    z,
    state,
  });

test('low-speed yard detector starts after sustained accurate low-speed vehicle movement', () => {
  let state = createInitialLowSpeedYardDetectorState();
  let result = locationSample({ offsetMs: 0, latitude: 51.5, state });
  state = result.state;
  result = locationSample({ offsetMs: 10_000, latitude: 51.50008, state });
  state = result.state;
  state = motionSensorSample({ offsetMs: 20_500, state });
  result = locationSample({ offsetMs: 21_000, latitude: 51.50016, state });

  assert.equal(result.shouldStartDriving, true);
  assert.equal(result.drivingStartedAtMs, startMs);
  assert.equal(result.reason, 'confirmed_low_speed_vehicle_movement');
});

test('low-speed yard detector waits for confirmation duration', () => {
  let state = createInitialLowSpeedYardDetectorState();
  let result = locationSample({ offsetMs: 0, latitude: 51.5, state });
  state = result.state;
  state = motionSensorSample({ offsetMs: 9_500, state });
  result = locationSample({ offsetMs: 10_000, latitude: 51.50016, state });

  assert.equal(result.shouldStartDriving, false);
  assert.equal(result.reason, 'confirming_duration');
});

test('low-speed yard detector waits for minimum displacement', () => {
  let state = createInitialLowSpeedYardDetectorState();
  let result = locationSample({ offsetMs: 0, latitude: 51.5, state });
  state = result.state;
  state = motionSensorSample({ offsetMs: 20_500, state });
  result = locationSample({ offsetMs: 21_000, latitude: 51.50003, state });

  assert.equal(result.shouldStartDriving, false);
  assert.equal(result.reason, 'confirming_distance');
});

test('low-speed yard detector blocks walking cadence', () => {
  let state = createInitialLowSpeedYardDetectorState();
  let result = locationSample({ offsetMs: 0, latitude: 51.5, state });
  state = result.state;

  for (let i = 0; i < 9; i += 1) {
    state = motionSensorSample({
      offsetMs: 14_000 + i * 700,
      x: i % 2 === 0 ? 1 : 1.25,
      y: 0,
      z: 0,
      state,
    });
  }

  result = locationSample({ offsetMs: 21_000, latitude: 51.50016, state });

  assert.equal(result.shouldStartDriving, false);
  assert.equal(result.reason, 'walking_likely');
});

test('low-speed yard detector blocks GPS-only low-speed movement', () => {
  let state = createInitialLowSpeedYardDetectorState();
  let result = locationSample({ offsetMs: 0, latitude: 51.5, state });
  state = result.state;
  result = locationSample({ offsetMs: 10_000, latitude: 51.50008, state });
  state = result.state;
  result = locationSample({ offsetMs: 21_000, latitude: 51.50016, state });

  assert.equal(result.shouldStartDriving, false);
  assert.equal(result.reason, 'motion_sensor_stale');
});

test('low-speed yard detector hands off at normal driving speeds', () => {
  const result = locationSample({
    offsetMs: 0,
    latitude: 51.5,
    speedKmh: 8,
    state: createInitialLowSpeedYardDetectorState(),
  });

  assert.equal(result.shouldStartDriving, false);
  assert.equal(result.reason, 'handoff_normal_detector');
});

test('low-speed yard detector ignores poor GPS accuracy', () => {
  const result = processLowSpeedYardLocationSample({
    nowMs: startMs,
    speedKmh: 3,
    latitude: 51.5,
    longitude: -0.1,
    accuracyM: 80,
    isDriving: false,
    state: createInitialLowSpeedYardDetectorState(),
  });

  assert.equal(result.shouldStartDriving, false);
  assert.equal(result.reason, 'accuracy');
});
