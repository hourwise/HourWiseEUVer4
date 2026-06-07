import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const BIOMETRIC_ACCESS_TOKEN_KEY = 'biometric_access_token';
const BIOMETRIC_REFRESH_TOKEN_KEY = 'biometric_refresh_token';
const BIOMETRIC_SESSION_METADATA_KEY = 'biometric_session_metadata';

export type StoredBiometricSessionMetadata = {
  userId: string;
  email: string | null;
};

export const getBiometricAvailability = async () => {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  return {
    isAvailable: hasHardware && isEnrolled,
    hasHardware,
    isEnrolled,
  };
};

export const hasStoredBiometricSession = async () => {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(BIOMETRIC_ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY),
  ]);

  return !!accessToken && !!refreshToken;
};

export const getStoredBiometricSessionMetadata = async (): Promise<StoredBiometricSessionMetadata | null> => {
  const rawMetadata = await SecureStore.getItemAsync(BIOMETRIC_SESSION_METADATA_KEY);
  if (!rawMetadata) return null;

  try {
    const parsed = JSON.parse(rawMetadata) as Partial<StoredBiometricSessionMetadata>;
    if (!parsed.userId || typeof parsed.userId !== 'string') return null;

    return {
      userId: parsed.userId,
      email: typeof parsed.email === 'string' ? parsed.email : null,
    };
  } catch {
    return null;
  }
};

export const saveBiometricSession = async (
  accessToken: string,
  refreshToken: string,
  metadata?: StoredBiometricSessionMetadata | null,
) => {
  const writes: Promise<void>[] = [
    SecureStore.setItemAsync(BIOMETRIC_ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY, refreshToken),
  ];

  if (metadata?.userId) {
    writes.push(
      SecureStore.setItemAsync(
        BIOMETRIC_SESSION_METADATA_KEY,
        JSON.stringify({
          userId: metadata.userId,
          email: metadata.email ?? null,
        }),
      ),
    );
  }

  await Promise.all(writes);
};

export const clearBiometricSession = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_SESSION_METADATA_KEY),
  ]);
};

export const isBiometricSessionConfigured = async () => {
  const availability = await getBiometricAvailability();
  const hasStoredSession = await hasStoredBiometricSession();

  return {
    isAvailable: availability.isAvailable,
    hasStoredSession,
    isEnabled: availability.isAvailable && hasStoredSession,
  };
};

const isInvalidStoredSessionError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('auth session missing') ||
    message.includes('refresh token') ||
    message.includes('invalid token') ||
    message.includes('token has expired') ||
    message.includes('jwt expired') ||
    message.includes('session expired') ||
    message.includes('session_not_found') ||
    message.includes('invalid refresh')
  );
};

export const authenticateWithBiometrics = async () => {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Sign in with biometrics',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
};

export const signInWithBiometricSession = async () => {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(BIOMETRIC_ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    throw new Error('No saved biometric session found.');
  }

  const authResult = await authenticateWithBiometrics();
  if (!authResult.success) {
    throw new Error('Biometric authentication was cancelled or failed.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    if (isInvalidStoredSessionError(error)) {
      await clearBiometricSession();
    }
    throw error;
  }
  return data.session;
};
