import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const BIOMETRIC_ACCESS_TOKEN_KEY = 'biometric_access_token';
const BIOMETRIC_REFRESH_TOKEN_KEY = 'biometric_refresh_token';

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

export const saveBiometricSession = async (accessToken: string, refreshToken: string) => {
  await Promise.all([
    SecureStore.setItemAsync(BIOMETRIC_ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY, refreshToken),
  ]);
};

export const clearBiometricSession = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY),
  ]);
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

  if (error) throw error;
  return data.session;
};
