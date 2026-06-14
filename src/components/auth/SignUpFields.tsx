import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Database } from '../../lib/database.types';
import FleetInviteFields from './FleetInviteFields';

type Invite = Database['public']['Tables']['driver_invites']['Row'];
export type AccountType = 'solo' | 'fleet';

type SignUpFieldsProps = {
  accountType: AccountType;
  fullName: string;
  email: string;
  password: string;
  inviteCode: string;
  verifiedInvite: Invite | null;
  verifyingInvite: boolean;
  onAccountTypeChange: (value: AccountType) => void;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onInviteCodeChange: (value: string) => void;
  onVerifyInvite: () => void;
};

export default function SignUpFields({
  accountType,
  fullName,
  email,
  password,
  inviteCode,
  verifiedInvite,
  verifyingInvite,
  onAccountTypeChange,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
  onInviteCodeChange,
  onVerifyInvite,
}: SignUpFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, accountType === 'solo' && styles.toggleButtonActive]}
          onPress={() => onAccountTypeChange('solo')}
        >
          <Text style={[styles.toggleButtonText, accountType === 'solo' && styles.toggleButtonTextActive]}>
            {t('auth.accountType.solo.title')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, accountType === 'fleet' && styles.toggleButtonActive]}
          onPress={() => onAccountTypeChange('fleet')}
        >
          <Text style={[styles.toggleButtonText, accountType === 'fleet' && styles.toggleButtonTextActive]}>
            {t('auth.accountType.fleet.title')}
          </Text>
        </TouchableOpacity>
      </View>

      {accountType === 'solo' ? (
        <TextInput
          style={styles.input}
          placeholder={t('auth.fields.driverName.placeholder')}
          value={fullName}
          onChangeText={onFullNameChange}
          placeholderTextColor="#94a3b8"
        />
      ) : (
        <FleetInviteFields
          inviteCode={inviteCode}
          fullName={fullName}
          verifiedInvite={verifiedInvite}
          verifying={verifyingInvite}
          onInviteCodeChange={onInviteCodeChange}
          onVerify={onVerifyInvite}
        />
      )}

      <TextInput
        style={[styles.input, verifiedInvite && styles.inputDisabled]}
        placeholder={t('auth.fields.email.placeholder')}
        value={email}
        onChangeText={onEmailChange}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!verifiedInvite}
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
  inputDisabled: {
    backgroundColor: '#475569',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    borderRadius: 8,
    marginBottom: 16,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#4f46e5',
  },
  toggleButtonText: {
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: 'white',
  },
});
