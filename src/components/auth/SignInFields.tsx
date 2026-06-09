import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

type SignInFieldsProps = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
};

export default function SignInFields({
  email,
  password,
  onEmailChange,
  onPasswordChange,
}: SignInFieldsProps) {
  return (
    <>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={onEmailChange}
        autoCapitalize="none"
        placeholderTextColor="#94a3b8"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={onPasswordChange}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholderTextColor="#94a3b8"
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#334155',
    padding: 12,
    marginBottom: 10,
    color: 'white',
    borderRadius: 8,
  },
});
