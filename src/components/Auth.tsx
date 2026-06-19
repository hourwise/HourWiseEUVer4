import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Database } from '../lib/database.types';
import {
  type InviteVerificationResult,
  verifyInviteCode,
} from '../lib/inviteService';
import { useAuth } from '../providers/AuthProvider';
import {
  type StoredBiometricSessionMetadata,
  clearBiometricSession,
  getBiometricAvailability,
  getStoredBiometricSessionMetadata,
  hasStoredBiometricSession,
  saveBiometricSession,
  signInWithBiometricSession,
} from '../lib/biometricAuth';
import BiometricSignInSection from './auth/BiometricSignInSection';
import SignInFields from './auth/SignInFields';
import SignUpFields, { type AccountType } from './auth/SignUpFields';
import { useTranslation } from 'react-i18next';

type Invite = Database['public']['Tables']['driver_invites']['Row'];
type InviteVerificationFailure = Exclude<InviteVerificationResult, { ok: true }>;

export default function Auth() {
  const { t } = useTranslation();
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [accountType, setAccountType] = useState<AccountType>('solo');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [verifiedInvite, setVerifiedInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSessionMetadata, setBiometricSessionMetadata] =
    useState<StoredBiometricSessionMetadata | null>(null);

  React.useEffect(() => {
    const loadBiometricState = async () => {
      try {
        const [availability, hasStoredSession, metadata] = await Promise.all([
          getBiometricAvailability(),
          hasStoredBiometricSession(),
          getStoredBiometricSessionMetadata(),
        ]);
        setBiometricAvailable(availability.isAvailable);
        setBiometricEnabled(hasStoredSession);
        setBiometricSessionMetadata(metadata);
      } catch (error) {
        console.warn('Biometric availability check failed:', error);
      }
    };

    loadBiometricState();
  }, []);

  const promptForBiometricEnable = async (
    session: NonNullable<Awaited<ReturnType<typeof signIn>>>,
    fallbackEmail: string,
  ) => {
    const availability = await getBiometricAvailability();
    if (!availability.isAvailable || !session?.access_token || !session.refresh_token) return;

    const storedMetadata = await getStoredBiometricSessionMetadata();
    const hasStoredSession = await hasStoredBiometricSession();
    const currentUserId = session.user.id;
    const currentEmail = session.user.email ?? fallbackEmail;

    if (storedMetadata?.userId === currentUserId) {
      return;
    }

    const promptTitle = hasStoredSession
      ? t('auth.biometric.replaceTitle')
      : t('auth.biometric.enableTitle');
    const promptMessage =
      hasStoredSession && storedMetadata?.email
        ? t('auth.biometric.replaceBody', { storedEmail: storedMetadata.email, currentEmail })
        : t('auth.biometric.enableBody');

    Alert.alert(promptTitle, promptMessage, [
      { text: t('auth.biometric.notNow'), style: 'cancel' },
      {
        text: hasStoredSession ? t('auth.biometric.replace') : t('auth.biometric.enable'),
        onPress: async () => {
          try {
            await saveBiometricSession(session.access_token, session.refresh_token, {
              userId: currentUserId,
              email: currentEmail,
            });
            setBiometricAvailable(true);
            setBiometricEnabled(true);
            setBiometricSessionMetadata({
              userId: currentUserId,
              email: currentEmail,
            });
            Alert.alert(t('auth.biometric.enabledTitle'), t('auth.biometric.enabledBody'));
          } catch (error: any) {
            Alert.alert(
              t('auth.biometric.setupFailedTitle'),
              error?.message || t('auth.biometric.setupFailedBody'),
            );
          }
        },
      },
    ]);
  };

  const showInviteVerificationFailure = (result: InviteVerificationFailure) => {
    const detailLines = [
      result.status ? t('auth.invite.statusLine', { status: result.status }) : null,
      result.expiresAt ? t('auth.invite.expiryLine', { expiresAt: result.expiresAt }) : null,
      result.guidance ?? null,
    ].filter(Boolean);

    const message =
      detailLines.length > 0
        ? `${result.message}\n\n${detailLines.join('\n')}`
        : result.message;

    Alert.alert(result.title ?? t('auth.invite.failedTitle'), message);
  };

  const handleVerifyCode = async () => {
    setVerifying(true);
    try {
      const result = await verifyInviteCode(inviteCode);

      if (result.ok) {
        Alert.alert(t('common.success'), t('auth.invite.validBody'));
        setVerifiedInvite(result.invite);
        setEmail(result.invite.email || '');
        setFullName(result.invite.full_name || '');
      } else {
        showInviteVerificationFailure(result);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleSignUp = async () => {
    if (accountType === 'fleet' && !verifiedInvite) {
      return Alert.alert(t('common.error'), t('auth.alerts.verifyInviteFirst'));
    }
    if (!email || !password) {
      return Alert.alert(t('common.error'), t('auth.alerts.emailPasswordRequired'));
    }
    if (accountType === 'solo' && !fullName) {
      return Alert.alert(t('common.error'), t('auth.alerts.fullNameRequired'));
    }

    setLoading(true);
    try {
      const session = await signUp({
        email,
        password,
        fullName,
        accountType,
        invite: verifiedInvite,
        inviteCode,
      });
      if (session) {
        await promptForBiometricEnable(session, email);
      }
    } catch (error: any) {
      Alert.alert(t('auth.alerts.signUpError.title'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const session = await signIn({ email, password });
      if (session) {
        await promptForBiometricEnable(session, email);
      }
    } catch (error: any) {
      Alert.alert(t('auth.alerts.loginFailed'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    try {
      await signInWithBiometricSession();
    } catch (error: any) {
      if (!(await hasStoredBiometricSession())) {
        setBiometricEnabled(false);
        setBiometricSessionMetadata(null);
      }
      Alert.alert(
        t('auth.biometric.signInFailedTitle'),
        error?.message || t('auth.biometric.signInFailedBody'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDisableBiometric = async () => {
    setLoading(true);
    try {
      await clearBiometricSession();
      setBiometricEnabled(false);
      setBiometricSessionMetadata(null);
      Alert.alert(t('auth.biometric.disabledTitle'), t('auth.biometric.disabledBody'));
    } catch (error: any) {
      Alert.alert(
        t('auth.biometric.disableFailedTitle'),
        error?.message || t('auth.biometric.disableFailedBody'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.brandBlock}>
        <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
        <Text style={styles.appName}>{t('app.title')}</Text>
        <Text style={styles.tagline}>{t('auth.tagline')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{mode === 'signIn' ? t('auth.title.signIn') : t('auth.title.signUp')}</Text>

        {mode === 'signUp' ? (
          <SignUpFields
            accountType={accountType}
            fullName={fullName}
            email={email}
            password={password}
            inviteCode={inviteCode}
            verifiedInvite={verifiedInvite}
            verifyingInvite={verifying}
            onAccountTypeChange={setAccountType}
            onFullNameChange={setFullName}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onInviteCodeChange={setInviteCode}
            onVerifyInvite={handleVerifyCode}
          />
        ) : (
          <SignInFields
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
          />
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={mode === 'signIn' ? handleLogin : handleSignUp}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{t('common.continue')}</Text>}
        </TouchableOpacity>

        <BiometricSignInSection
          visible={mode === 'signIn' && biometricAvailable && biometricEnabled}
          loading={loading}
          email={biometricSessionMetadata?.email ?? null}
          onSignIn={handleBiometricLogin}
          onDisable={handleDisableBiometric}
        />

        <TouchableOpacity onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          <Text style={styles.switch}>
            {mode === 'signIn'
              ? t('auth.switchTo.signUp')
              : t('auth.switchTo.signIn')}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  tagline: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 4,
  },
  card: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#1e293b',
    padding: 24,
    borderRadius: 16,
    marginTop: 20,
  },
  title: {
    fontSize: 24,
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  switch: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
  },
});
