import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

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
  if (!visible) return null;

  return (
    <>
      <TouchableOpacity style={styles.secondaryButton} onPress={onSignIn} disabled={loading}>
        <Text style={styles.secondaryButtonText}>
          {email ? `Sign in as ${email}` : 'Sign in with biometrics'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDisable} disabled={loading}>
        <Text style={styles.switch}>Disable biometric sign-in on this device</Text>
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
