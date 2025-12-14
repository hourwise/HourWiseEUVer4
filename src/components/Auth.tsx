import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import { supabase } from '../lib/supabase';
import { User, Lock, Mail, LucideIcon } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';

// --- Reusable Input Component ---
interface InputFieldProps {
  icon: LucideIcon;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric';
}

const InputField = ({
  icon: Icon,
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType = 'default'
}: InputFieldProps) => (
  <View>
    <Text className="text-white mb-2 font-semibold">{label}</Text>
    <View className="flex-row items-center bg-slate-700 rounded-lg px-3 border border-slate-600 focus:border-blue-500">
      <Icon color="#94a3b8" size={20} />
      <TextInput
        className="flex-1 p-3 text-white h-12"
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  </View>
);

/// --- Main Component ---
 export default function Auth() {
    const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [driverName, setDriverName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  useEffect(() => {
    checkBiometrics();
    checkExistingSession();
  }, []);

  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setIsBiometricSupported(compatible && enrolled);
  };

  // improved session check utilizing Supabase persistence instead of unsafe storage
  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // If a session exists, try to unlock with biometrics immediately
        promptBiometrics();
      }
    } catch (error) {
      console.log('Session check failed', error);
    }
  };

  const promptBiometrics = async () => {
    if (!isBiometricSupported) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock with Biometrics',
      fallbackLabel: 'Use Passcode',
    });

    if (result.success) {
        }
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (mode === 'signUp' && !driverName) {
        Alert.alert('Error', 'Please enter your name');
        return;
    }

    setLoading(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Supabase client automatically persists the session now.
      } else {
        const { data: { user, session }, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        if (user && !session) {
             Alert.alert('Check your email', 'Please check your email for a confirmation link to complete your registration.');
             setLoading(false);
             return;
        }

        if (user && session) {
            const { error: profileError } = await supabase
                .from('driver_profiles')
                .upsert(
                    { user_id: user.id, driver_name: driverName },
                    { onConflict: 'user_id' }
                );

            if (profileError) {
                console.error("Error creating profile:", profileError);
                throw new Error("Account created, but failed to save profile. Please try logging in.");
            }
        }
      }

         } catch (error: any) {
      Alert.alert('Authentication Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-slate-900 justify-center p-4"
      >
        <View className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl">
          <Text className="text-3xl font-bold text-white text-center mb-2">
            {mode === 'signIn' ? 'Welcome Back' : 'Create Account'}
          </Text>
          <Text className="text-slate-400 text-center mb-8">
            {mode === 'signIn' ? 'Sign in to start your shift' : 'Set up your driver profile'}
          </Text>

          <View className="space-y-4">
            {mode === 'signUp' && (
              <InputField
                label="Driver Name"
                icon={User}
                value={driverName}
                onChangeText={setDriverName}
                placeholder="Your Full Name"
                autoCapitalize="words"
              />
            )}

            <InputField
              label="Email"
              icon={Mail}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
            />

            <InputField
              label="Password"
              icon={Lock}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />

            <TouchableOpacity
              onPress={handleAuth}
              disabled={loading}
              className="bg-blue-600 p-4 rounded-lg mt-4 active:bg-blue-700"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-center font-bold text-lg">
                  {mode === 'signIn' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
              className="mt-4 p-2"
            >
              <Text className="text-slate-400 text-center">
                {mode === 'signIn' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}
