import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  return (
    <>
      <TextInput
        style={styles.input}
        placeholder={t('auth.fields.email.placeholder')}
        value={email}
        onChangeText={onEmailChange}
        autoCapitalize="none"
        placeholderTextColor="#94a3b8"
      />
      <TextInput
        style={styles.input}
        placeholder={t('auth.fields.password.placeholder')}
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
