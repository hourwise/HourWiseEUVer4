import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptSessionValue,
  encryptSessionValue,
  parseEncryptedSessionPayload,
  toSecureStoreSafeKey,
} from '../../sessionStorageCrypto';

const createKey = () => new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));

test('encryptSessionValue stores ciphertext instead of plaintext and decrypts back to the original value', () => {
  const value = JSON.stringify({
    access_token: 'access-token-value',
    refresh_token: 'refresh-token-value',
    user: { id: 'user-1' },
  });

  const payload = encryptSessionValue(value, createKey());

  assert.equal(payload.version, 1);
  assert.notEqual(payload.ciphertextHex, value);
  assert.equal(payload.ciphertextHex.includes('access-token-value'), false);
  assert.equal(decryptSessionValue(payload, createKey()), value);
});

test('parseEncryptedSessionPayload accepts only the supported payload shape', () => {
  const payload = encryptSessionValue('session-value', createKey());

  assert.deepEqual(
    parseEncryptedSessionPayload(JSON.stringify(payload)),
    payload,
  );
  assert.equal(parseEncryptedSessionPayload(null), null);
  assert.equal(parseEncryptedSessionPayload('not-json'), null);
  assert.equal(parseEncryptedSessionPayload(JSON.stringify({ version: 2, ciphertextHex: 'abc' })), null);
  assert.equal(parseEncryptedSessionPayload(JSON.stringify({ version: 1, ciphertextHex: 123 })), null);
});

test('toSecureStoreSafeKey removes characters rejected by Expo SecureStore keys', () => {
  const safeKey = toSecureStoreSafeKey('sb-project-ref-auth-token:with:colons/slashes');

  assert.match(safeKey, /^[A-Za-z0-9._-]+$/);
  assert.equal(safeKey.includes(':'), false);
  assert.equal(safeKey.includes('/'), false);
});
