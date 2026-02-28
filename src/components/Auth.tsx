import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { verifyInviteCode, acceptInvite } from '../lib/inviteService';
import type { Database } from '../lib/database.types';

type Invite = Database['public']['Tables']['driver_invites']['Row'];
type AccountType = 'solo' | 'fleet';

export default function Auth() {
  // CORRECTED: Default to 'signIn' for returning users.
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [accountType, setAccountType] = useState<AccountType>('solo');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [verifiedInvite, setVerifiedInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleVerifyCode = async () => {
    setVerifying(true);
    const inviteData = await verifyInviteCode(inviteCode);
    setVerifying(false);

    if (inviteData) {
      Alert.alert("Success", "Invite code is valid. Your details have been pre-filled.");
      setVerifiedInvite(inviteData);
      setEmail(inviteData.email || '');
      setFullName(inviteData.full_name || '');
    } else {
      Alert.alert("Error", "Invalid or expired invite code. Please check the code and try again.");
    }
  };

  const handleSignUp = async () => {
    if (accountType === 'fleet' && !verifiedInvite) return Alert.alert("Error", "Please verify your invite code before creating an account.");
    if (!email || !password) return Alert.alert("Error", "Email and password are required.");
    if (accountType === 'solo' && !fullName) return Alert.alert("Error", "Please enter your full name.");

    setLoading(true);

    try {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });

        if (authError) throw new Error(authError.message);
        if (!data.user) throw new Error('Could not create user account. Please try again.');

        const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id, user_id: data.user.id, email: data.user.email,
            full_name: fullName, account_type: accountType,
            company_id: verifiedInvite?.company_id || null, role: 'driver'
        });

        if (profileError) console.warn("Best-effort profile creation failed on signup:", profileError.message);
        if (accountType === 'fleet' && verifiedInvite) await acceptInvite(verifiedInvite.id, data.user.id);
        if (!data.session && data.user) Alert.alert("Check Your Email", "A confirmation link has been sent.");

    } catch (error: any) {
        Alert.alert('Sign-Up Error', error.message);
    } finally {
        setLoading(false);
    }
  };

  async function handleLogin() {
    setLoading(true);
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
    } catch (error: any) {
        Alert.alert("Login Failed", error.message);
    } finally {
        setLoading(false);
    }
   }

  const renderSignUpForm = () => (
    <>
      <View style={styles.toggleContainer}><TouchableOpacity style={[styles.toggleButton, accountType === 'solo' && styles.toggleButtonActive]} onPress={() => setAccountType('solo')}><Text style={[styles.toggleButtonText, accountType === 'solo' && styles.toggleButtonTextActive]}>Solo Driver</Text></TouchableOpacity><TouchableOpacity style={[styles.toggleButton, accountType === 'fleet' && styles.toggleButtonActive]} onPress={() => setAccountType('fleet')}><Text style={[styles.toggleButtonText, accountType === 'fleet' && styles.toggleButtonTextActive]}>Fleet Member</Text></TouchableOpacity></View>
      {accountType === 'solo' ? (<TextInput style={styles.input} placeholder="Full Name" value={fullName} onChangeText={setFullName} placeholderTextColor="#94a3b8" />) : (<><View style={styles.inviteContainer}><TextInput style={[styles.input, styles.inviteInput]} placeholder="Invite Code" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" editable={!verifiedInvite} placeholderTextColor="#94a3b8" /><TouchableOpacity style={styles.verifyButton} onPress={handleVerifyCode} disabled={verifying || !!verifiedInvite}>{verifying ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verify</Text>}</TouchableOpacity></View>{verifiedInvite && <Text style={styles.verifiedText}>✓ Verified: Welcome, {fullName}!</Text>}</>)}
      <TextInput style={[styles.input, verifiedInvite && styles.inputDisabled]} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!verifiedInvite} placeholderTextColor="#94a3b8" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94a3b8" />
    </>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={{ alignItems: 'center', marginBottom: 32 }}><Image source={require('../../assets/favicon.png')} style={styles.logo} /><Text style={styles.appName}>HourWise EU</Text><Text style={styles.tagline}>EU Compliance & Work Time Tracking Made Simple</Text></View>
      <View style={styles.card}>
        <Text style={styles.title}>{mode === 'signIn' ? 'Sign In' : 'Create Account'}</Text>
        {mode === 'signUp' && renderSignUpForm()}
        {mode === 'signIn' && (<><TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" placeholderTextColor="#94a3b8" /><TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94a3b8" /></>)}
        <TouchableOpacity style={styles.button} onPress={mode === 'signIn' ? handleLogin : handleSignUp} disabled={loading}>{loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue</Text>}</TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}><Text style={styles.switch}>{mode === 'signIn' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 16 },
  logo: { width: 120, height: 120, resizeMode: 'contain', marginBottom: 12 },
  appName: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  tagline: { fontSize: 16, color: '#94a3b8', marginTop: 4 },
  card: { width: '100%', maxWidth: 450, backgroundColor: '#1e293b', padding: 24, borderRadius: 16, marginTop: 20 },
  title: { fontSize: 24, color: 'white', marginBottom: 20, textAlign: 'center', fontWeight: 'bold' },
  input: { backgroundColor: '#334155', padding: 12, marginBottom: 10, color: 'white', borderRadius: 8 },
  inputDisabled: { backgroundColor: '#475569' },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontWeight: '600' },
  switch: { color: '#94a3b8', textAlign: 'center', marginTop: 12 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#334155', borderRadius: 8, marginBottom: 16, padding: 4 },
  toggleButton: { flex: 1, paddingVertical: 10, borderRadius: 6 },
  toggleButtonActive: { backgroundColor: '#4f46e5' },
  toggleButtonText: { color: '#94a3b8', textAlign: 'center', fontWeight: '600' },
  toggleButtonTextActive: { color: 'white' },
  inviteContainer: { flexDirection: 'row', gap: 8 },
  inviteInput: { flex: 1, marginBottom: 0 },
  verifyButton: { backgroundColor: '#16a34a', paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  verifiedText: { color: '#4ade80', marginBottom: 10, fontStyle: 'italic' },
});
