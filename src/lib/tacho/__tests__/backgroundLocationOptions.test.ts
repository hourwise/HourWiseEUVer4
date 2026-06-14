import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKGROUND_LOCATION_DISTANCE_INTERVAL_M,
  BACKGROUND_LOCATION_TIME_INTERVAL_MS,
  buildDurableBackgroundLocationOptions,
  hasDurableBackgroundLocationOptions,
} from '../backgroundLocationOptions';

test('buildDurableBackgroundLocationOptions keeps the foreground service alive after app destroy', () => {
  const options = buildDurableBackgroundLocationOptions({
    accuracy: 'best',
    notificationTitle: 'HourWise active',
    notificationBody: 'Tracking work and driving time',
  });

  assert.equal(options.timeInterval, BACKGROUND_LOCATION_TIME_INTERVAL_MS);
  assert.equal(options.distanceInterval, BACKGROUND_LOCATION_DISTANCE_INTERVAL_M);
  assert.equal(options.pausesUpdatesAutomatically, false);
  assert.equal(options.foregroundService.killServiceOnDestroy, false);
});

test('hasDurableBackgroundLocationOptions rejects stale or non-foreground registrations', () => {
  assert.equal(hasDurableBackgroundLocationOptions(null), false);
  assert.equal(
    hasDurableBackgroundLocationOptions({
      timeInterval: BACKGROUND_LOCATION_TIME_INTERVAL_MS,
      distanceInterval: BACKGROUND_LOCATION_DISTANCE_INTERVAL_M,
      pausesUpdatesAutomatically: false,
    }),
    false,
  );
  assert.equal(
    hasDurableBackgroundLocationOptions({
      timeInterval: BACKGROUND_LOCATION_TIME_INTERVAL_MS,
      distanceInterval: BACKGROUND_LOCATION_DISTANCE_INTERVAL_M,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        killServiceOnDestroy: true,
      },
    }),
    false,
  );
});

test('hasDurableBackgroundLocationOptions accepts the desired registration shape', () => {
  assert.equal(
    hasDurableBackgroundLocationOptions(
      buildDurableBackgroundLocationOptions({
        accuracy: 'best',
        notificationTitle: 'HourWise active',
        notificationBody: 'Tracking work and driving time',
      }),
    ),
    true,
  );
});
