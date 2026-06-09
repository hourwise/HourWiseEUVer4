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

type Invite = Database['public']['Tables']['driver_invites']['Row'];
type InviteVerificationFailure = Exclude<InviteVerificationResult, { ok: true }>;

export default function Auth() {
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
      ? 'Replace biometric sign-in?'
      : 'Enable biometric sign-in?';
    const promptMessage =
      hasStoredSession && storedMetadata?.email
        ? `This device is currently set to sign in as ${storedMetadata.email}. Replace it with ${currentEmail}?`
        : 'Use fingerprint or face unlock for faster sign-in on this device.';

    Alert.alert(promptTitle, promptMessage, [
      { text: 'Not now', style: 'cancel' },
      {
        text: hasStoredSession ? 'Replace' : 'Enable',
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
            Alert.alert('Enabled', 'Biometric sign-in is now available on this device.');
          } catch (error: any) {
            Alert.alert(
              'Biometric setup failed',
              error?.message || 'Could not enable biometric sign-in.',
            );
          }
        },
      },
    ]);
  };

  const showInviteVerificationFailure = (result: InviteVerificationFailure) => {
    const detailLines = [
      result.status ? `Status: ${result.status}` : null,
      result.expiresAt ? `Expiry: ${result.expiresAt}` : null,
      result.guidance ?? null,
    ].filter(Boolean);

    const message =
      detailLines.length > 0
        ? `${result.message}\n\n${detailLines.join('\n')}`
        : result.message;

    Alert.alert(result.title ?? 'Invite verification failed', message);
  };

  const handleVerifyCode = async () => {
    setVerifying(true);
    try {
      const result = await verifyInviteCode(inviteCode);

      if (result.ok) {
        Alert.alert('Success', 'Invite code is valid. Your details have been pre-filled.');
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
      return Alert.alert('Error', 'Please verify your invite code before creating an account.');
    }
    if (!email || !password) {
      return Alert.alert('Error', 'Email and password are required.');
    }
    if (accountType === 'solo' && !fullName) {
      return Alert.alert('Error', 'Please enter your full name.');
    }

    setLoading(true);
    try {
      const session = await signUp({
        email,
        password,
        fullName,
        accountType,
        invite: verifiedInvite,
      });
      if (session) {
        await promptForBiometricEnable(session, email);
      }
    } catch (error: any) {
      Alert.alert('Sign-Up Error', error.message);
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
      Alert.alert('Login Failed', error.message);
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
        'Biometric Sign-In Failed',
        error?.message || 'Could not sign in with biometrics.',
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
      Alert.alert('Disabled', 'Biometric sign-in has been removed from this device.');
    } catch (error: any) {
      Alert.alert(
        'Disable failed',
        error?.message || 'Could not remove biometric sign-in from this device.',
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
        <Text style={styles.appName}>HourWise EU</Text>
        <Text style={styles.tagline}>EU Compliance & Work Time Tracking Made Simple</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{mode === 'signIn' ? 'Sign In' : 'Create Account'}</Text>

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
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue</Text>}
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
              ? "Don't have an account? Sign Up"
              : 'Already have an account? Sign In'}
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
