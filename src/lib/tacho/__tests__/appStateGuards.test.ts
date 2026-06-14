import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldRunDebouncedResumeRefresh,
  shouldRunInitialRestore,
} from '../appStateGuards';

test('shouldRunDebouncedResumeRefresh allows the first active refresh', () => {
  assert.equal(
    shouldRunDebouncedResumeRefresh({
      nowMs: 1000,
      lastRefreshAtMs: 0,
      isRefreshInFlight: false,
    }),
    true,
  );
});

test('shouldRunDebouncedResumeRefresh blocks in-flight and rapid active refreshes', () => {
  assert.equal(
    shouldRunDebouncedResumeRefresh({
      nowMs: 2500,
      lastRefreshAtMs: 1000,
      isRefreshInFlight: true,
    }),
    false,
  );
  assert.equal(
    shouldRunDebouncedResumeRefresh({
      nowMs: 2000,
      lastRefreshAtMs: 1000,
      isRefreshInFlight: false,
      debounceMs: 1500,
    }),
    false,
  );
});

test('shouldRunDebouncedResumeRefresh allows refresh after debounce window', () => {
  assert.equal(
    shouldRunDebouncedResumeRefresh({
      nowMs: 2600,
      lastRefreshAtMs: 1000,
      isRefreshInFlight: false,
      debounceMs: 1500,
    }),
    true,
  );
});

test('shouldRunInitialRestore runs once per restore key', () => {
  assert.equal(
    shouldRunInitialRestore({
      restoreKey: 'timer:user-1',
      lastRestoreKey: null,
    }),
    true,
  );
  assert.equal(
    shouldRunInitialRestore({
      restoreKey: 'timer:user-1',
      lastRestoreKey: 'timer:user-1',
    }),
    false,
  );
  assert.equal(
    shouldRunInitialRestore({
      restoreKey: 'timer:user-2',
      lastRestoreKey: 'timer:user-1',
    }),
    true,
  );
});
