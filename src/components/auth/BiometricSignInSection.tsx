import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

type BiometricSignInSectionProps = {
  visible: boolean;
  loading: boolean;
  email: string | null;
  onSignIn: () => void;
  onDisable: () => void;
};

export default function BiometricSignInSection({
  visible,
  loading,
  email,
  onSignIn,
  onDisable,
}: BiometricSignInSectionProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <>
      <TouchableOpacity style={styles.secondaryButton} onPress={onSignIn} disabled={loading}>
        <Text style={styles.secondaryButtonText}>
          {email ? t('auth.biometric.signInAs', { email }) : t('auth.biometric.signIn')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDisable} disabled={loading}>
        <Text style={styles.switch}>{t('auth.biometric.disableOnDevice')}</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  secondaryButton: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#475569',
  },
  secondaryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  switch: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
  },
});
