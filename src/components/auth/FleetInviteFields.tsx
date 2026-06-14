import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Database } from '../../lib/database.types';

type Invite = Database['public']['Tables']['driver_invites']['Row'];

type FleetInviteFieldsProps = {
  inviteCode: string;
  fullName: string;
  verifiedInvite: Invite | null;
  verifying: boolean;
  onInviteCodeChange: (value: string) => void;
  onVerify: () => void;
};

export default function FleetInviteFields({
  inviteCode,
  fullName,
  verifiedInvite,
  verifying,
  onInviteCodeChange,
  onVerify,
}: FleetInviteFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.inviteContainer}>
        <TextInput
          style={[styles.input, styles.inviteInput]}
          placeholder={t('auth.fields.inviteCode.placeholder')}
          value={inviteCode}
          onChangeText={onInviteCodeChange}
          autoCapitalize="characters"
          editable={!verifiedInvite}
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={styles.verifyButton}
          onPress={onVerify}
          disabled={verifying || !!verifiedInvite}
        >
          {verifying ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('auth.buttons.verify')}</Text>}
        </TouchableOpacity>
      </View>
      {verifiedInvite ? <Text style={styles.verifiedText}>{t('auth.invite.verifiedWelcome', { fullName })}</Text> : null}
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
  inviteContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    marginBottom: 0,
  },
  verifyButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  verifiedText: {
    color: '#4ade80',
    marginBottom: 10,
    fontStyle: 'italic',
  },
});
