import * as aesjs from 'aes-js';

export type EncryptedSessionPayload = {
  version: 1;
  ciphertextHex: string;
};

const CTR_INITIAL_VALUE = 1;

export const encryptSessionValue = (value: string, keyBytes: Uint8Array): EncryptedSessionPayload => {
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(CTR_INITIAL_VALUE));
  const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

  return {
    version: 1,
    ciphertextHex: aesjs.utils.hex.fromBytes(encryptedBytes),
  };
};

export const decryptSessionValue = (
  payload: EncryptedSessionPayload,
  keyBytes: ArrayLike<number>,
): string => {
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(CTR_INITIAL_VALUE));
  const encryptedBytes = aesjs.utils.hex.toBytes(payload.ciphertextHex);
  const decryptedBytes = cipher.decrypt(encryptedBytes);
  return aesjs.utils.utf8.fromBytes(decryptedBytes);
};

export const parseEncryptedSessionPayload = (rawPayload: string | null): EncryptedSessionPayload | null => {
  if (!rawPayload) return null;

  try {
    const parsed = JSON.parse(rawPayload) as Partial<EncryptedSessionPayload>;
    if (parsed.version !== 1 || typeof parsed.ciphertextHex !== 'string') return null;
    return {
      version: 1,
      ciphertextHex: parsed.ciphertextHex,
    };
  } catch {
    return null;
  }
};

