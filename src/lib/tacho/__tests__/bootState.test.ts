import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveBootState } from '../../startup/bootState';

const baseInput = {
  session: { user: { id: 'user-1' } } as any,
  profile: null,
  authLoading: false,
  bootstrapping: false,
  needsSetup: false,
  needsLastShiftEntry: false,
  permissionsGranted: true,
  subscriptionLoading: false,
  paywallPolicy: 'bypass' as const,
  subscriptionActive: false,
  hasAccess: true,
};

test('deriveBootState routes auth loading before signed-out state', () => {
  const state = deriveBootState({
    ...baseInput,
    session: null,
    authLoading: true,
  });

  assert.equal(state.stage, 'auth_resolving');
});

test('deriveBootState gates setup before permissions and paywall', () => {
  const state = deriveBootState({
    ...baseInput,
    needsSetup: true,
    permissionsGranted: false,
    hasAccess: false,
  });

  assert.equal(state.stage, 'onboarding_setup');
});

test('deriveBootState waits for enforced subscription loading', () => {
  const state = deriveBootState({
    ...baseInput,
    subscriptionLoading: true,
    paywallPolicy: 'enforce',
  });

  assert.equal(state.stage, 'profile_bootstrapping');
});

test('deriveBootState allows bypass mode through without active subscription', () => {
  const state = deriveBootState(baseInput);

  assert.equal(state.stage, 'ready');
  assert.equal(state.subscriptionActive, false);
});
