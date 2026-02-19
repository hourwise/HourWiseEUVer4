import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const CreateProfileScreen = () => {
  const { user, refreshSession } = useAuth();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'driver' | 'manager'>('driver');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateProfile = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a profile.');
      return;
    }

    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name.');
      return;
    }
    
    if (role === 'manager' && !companyName.trim()) {
      Alert.alert('Error', 'Please enter your company name.');
      return;
    }

    setLoading(true);

    try {
      let companyId: string | null = null;
      if (role === 'manager' && companyName.trim()) {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .insert({ name: companyName.trim(), created_by: user.id })
          .select()
          .single();

        if (companyError) throw companyError;
        companyId = company.id;
      }

      const { error: profileError } = await supabase.from('profiles').insert({
        user_id: user.id,
        email: user.email,
        full_name: fullName.trim(),
        role,
        company_id: companyId,
        account_type: 'fleet',
      });

      if (profileError) throw profileError;
      
      Alert.alert('Success', 'Your profile has been created.');
      await refreshSession(); // This will trigger a reload in AppNavigator

    } catch (error) {
      console.error('Error creating profile:', error);
      Alert.alert('Error', 'There was an issue creating your profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Your Profile</Text>

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        placeholderTextColor="#9ca3af"
        value={fullName}
        onChangeText={setFullName}
      />
      
      <View style={styles.roleSelector}>
        <Button title="Driver" onPress={() => setRole('driver')} color={role === 'driver' ? '#3b82f6' : '#6b7280'} />
        <Button title="Manager" onPress={() => setRole('manager')} color={role ==='manager' ? '#3b82f6' : '#6b7280'} />
      </View>

      {role === 'manager' && (
        <TextInput
          style={styles.input}
          placeholder="Company Name"
          placeholderTextColor="#9ca3af"
          value={companyName}
          onChangeText={setCompanyName}
        />
      )}
      
      <Button title={loading ? 'Creating...' : 'Create Profile'} onPress={handleCreateProfile} disabled={loading} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#1e293b',
    color: 'white',
    padding: 15,
    borderRadius: 5,
    marginBottom: 15,
  },
  roleSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 15,
  }
});

export default CreateProfileScreen;
