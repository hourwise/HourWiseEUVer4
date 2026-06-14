import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import {
  decryptSessionValue,
  encryptSessionValue,
  parseEncryptedSessionPayload,
  toSecureStoreSafeKey,
  type EncryptedSessionPayload,
} from './sessionStorageCrypto';

const STORAGE_PREFIX = 'hourwise.supabase.session';
const KEY_SUFFIX = 'encryption-key';
const AES_KEY_BYTES = 32;

const encryptedStorageKey = (key: string) => `${STORAGE_PREFIX}:${key}:payload`;
const secureKeyStorageKey = (key: string) =>
  `${STORAGE_PREFIX}.${toSecureStoreSafeKey(key)}.${KEY_SUFFIX}`;

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const clearStorageForKey = async (key: string) => {
  await Promise.all([
    AsyncStorage.removeItem(encryptedStorageKey(key)),
    AsyncStorage.removeItem(key),
    SecureStore.deleteItemAsync(secureKeyStorageKey(key)),
  ]);
};

export const supabaseSessionStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const [rawPayload, keyHex] = await Promise.all([
      AsyncStorage.getItem(encryptedStorageKey(key)),
      SecureStore.getItemAsync(secureKeyStorageKey(key)),
    ]);

    const encryptedPayload = parseEncryptedSessionPayload(rawPayload);

    if (encryptedPayload && keyHex) {
      try {
        return decryptSessionValue(encryptedPayload, aesjs.utils.hex.toBytes(keyHex));
      } catch {
        await clearStorageForKey(key);
        return null;
      }
    }

    if (rawPayload || keyHex) {
      await clearStorageForKey(key);
      return null;
    }

    const legacyPlainSession = await AsyncStorage.getItem(key);
    if (!legacyPlainSession) return null;

    await supabaseSessionStorage.setItem(key, legacyPlainSession);
    return legacyPlainSession;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    const keyBytes = randomBytes(AES_KEY_BYTES);
    const payload: EncryptedSessionPayload = {
      ...encryptSessionValue(value, keyBytes),
    };

    await Promise.all([
      SecureStore.setItemAsync(secureKeyStorageKey(key), aesjs.utils.hex.fromBytes(keyBytes)),
      AsyncStorage.setItem(encryptedStorageKey(key), JSON.stringify(payload)),
      AsyncStorage.removeItem(key),
    ]);
  },

  removeItem: async (key: string): Promise<void> => {
    await clearStorageForKey(key);
  },
};
