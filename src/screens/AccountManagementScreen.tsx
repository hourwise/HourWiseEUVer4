import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, SafeAreaView, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, User, Mail, Lock, Download, Trash2, LogOut, CreditCard, X, Save, Shield, FileText, Info } from 'react-native-feather';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import DownloadReportModal from '../components/DownloadReportModal';
import Constants from 'expo-constants';

const MenuItem = ({ label, icon, onPress, isDestructive = false }: { label: string; icon: React.ReactNode; onPress: () => void; isDestructive?: boolean }) => (
  <TouchableOpacity onPress={onPress} className={`flex-row items-center p-4 rounded-lg bg-slate-800 border border-slate-700 ${!isDestructive && 'active:bg-slate-700'}`}>
    {icon}
    <Text className={`text-lg ml-4 ${isDestructive ? 'text-red-500' : 'text-white'}`}>{label}</Text>
  </TouchableOpacity>
);

const SectionHeader = ({ title }: { title: string }) => (
  <Text className="text-slate-400 font-bold uppercase my-4">{title}</Text>
);

export default function AccountManagementScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { session, profile, isFleetDriver, refreshProfile, signOut } = useAuth();

  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editType, setEditType] = useState<'name' | 'email' | 'password' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (isFleetDriver && profile?.company_id) {
      fetchCompanyName();
    }
  }, [isFleetDriver, profile?.company_id]);

  const fetchCompanyName = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('name')
        .eq('id', profile?.company_id)
        .single();

      if (data) setCompanyName(data.name);
    } catch (error) {
      console.warn('Error fetching company name:', error);
    }
  };

  const openEditModal = (type: 'name' | 'email' | 'password') => {
    setEditType(type);
    if (type === 'name') setEditValue(profile?.full_name || '');
    else if (type === 'email') setEditValue(session?.user?.email || '');
    else setEditValue('');
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!editValue.trim() && editType !== 'password') return;
    if (editType === 'password' && editValue.length < 6) {
        Alert.alert(t('common.error'), "Password must be at least 6 characters.");
        return;
    }

    setIsBusy(true);
    try {
      if (editType === 'name') {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: editValue.trim() })
          .eq('id', session?.user?.id);
        if (error) throw error;
        await refreshProfile();
      } else if (editType === 'email') {
        const { error } = await supabase.auth.updateUser({ email: editValue.trim() });
        if (error) throw error;
        Alert.alert(t('common.success'), "A confirmation link has been sent to your new email address.");
      } else if (editType === 'password') {
        const { error } = await supabase.auth.updateUser({ password: editValue });
        if (error) throw error;
        Alert.alert(t('common.success'), "Password updated successfully.");
      }
      setEditModalVisible(false);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('account.delete.confirmTitle', "Delete Account?"),
      t('account.delete.gdprNotice', "Your account will be deactivated immediately. For formal data erasure requests, please visit our privacy portal. Your work and payroll records will be retained by your employer for the legally required period (e.g., 6 years for UK tax law). \n\nhttps://www.hourwiseeu.co.uk/privacy-request"),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('account.delete.confirmButton', "Request Deletion"),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.functions.invoke('delete-user-data');
              if (error) throw error;
              Alert.alert(
                t('account.delete.requestSuccessTitle'),
                t('account.delete.requestSuccessMessage')
              );
              await signOut();
            } catch (error: any) {
              Alert.alert(t('common.error'), t('account.delete.errorMessage'));
              console.error('Account deletion request error:', error.message);
            }
          }
        }
      ]
    );
  };

  const version = Constants.expoConfig?.version || '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '';

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="flex-row items-center p-4 border-b border-slate-800">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2">
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-xl text-white font-bold text-center flex-1 pr-10">{t('account.title', 'Account Management')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {isFleetDriver && companyName && (
          <View className="mb-4 p-4 rounded-xl bg-blue-900/20 border border-blue-500/30">
            <View className="flex-row items-center mb-1">
              <Info size={16} color="#60a5fa" />
              <Text className="text-blue-400 text-xs font-bold uppercase ml-2 tracking-wider">Fleet Account</Text>
            </View>
            <Text className="text-white text-lg font-bold">Linked to: {companyName}</Text>
          </View>
        )}

        <SectionHeader title={t('account.profileSection', 'Profile')} />
        <View className="space-y-3">
          <MenuItem label={t('account.editName', 'Edit Full Name')} icon={<User color="white" />} onPress={() => openEditModal('name')} />
          <MenuItem label={t('account.changeEmail', 'Change Email')} icon={<Mail color="white" />} onPress={() => openEditModal('email')} />
          <MenuItem label={t('account.changePassword', 'Change Password')} icon={<Lock color="white" />} onPress={() => openEditModal('password')} />
        </View>

        <SectionHeader title={t('account.dataSection', 'Data Management')} />
        <View className="space-y-3">
          <MenuItem label={t('account.exportData', 'Export My Data')} icon={<Download color="white" />} onPress={() => setIsReportModalVisible(true)} />
          <MenuItem label={t('account.manageSubscription', 'Manage My Subscription')} icon={<CreditCard color="white" />} onPress={() => navigation.navigate('Paywall')} />
          <MenuItem
            label="Privacy & Data Rights"
            icon={<Shield color="white" />}
            onPress={() => Linking.openURL('https://www.hourwiseeu.co.uk/privacy-request')}
          />
          <MenuItem
            label="Terms of Service"
            icon={<FileText color="white" />}
            onPress={() => Linking.openURL('https://www.hourwiseeu.co.uk/terms')}
          />
        </View>

        <SectionHeader title={t('account.dangerZone', 'Danger Zone')} />
        <View className="space-y-3 p-4 rounded-lg border border-red-500/50 bg-red-900/20">
          <MenuItem label={t('common.logout', 'Sign Out')} icon={<LogOut color="white" />} onPress={signOut} />
          <MenuItem label={t('account.delete.title', 'Delete My Account')} icon={<Trash2 color="#f87171" />} onPress={handleDeleteAccount} isDestructive />
        </View>

        <View className="mt-8 mb-4 items-center">
          <Text className="text-slate-500 text-xs uppercase font-bold tracking-widest">
            v{version}{build ? ` (${build})` : ''}
          </Text>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View className="flex-1 justify-center items-center bg-black/60 p-6">
          <View className="bg-slate-900 rounded-2xl p-6 w-full max-w-sm border border-slate-700 shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white uppercase tracking-wider">
                {editType === 'name' ? t('account.editName') : editType === 'email' ? t('account.changeEmail') : t('account.changePassword')}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}><X size={24} color="#94a3b8" /></TouchableOpacity>
            </View>

            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              placeholder={editType === 'password' ? "Enter new password" : ""}
              placeholderTextColor="#64748b"
              secureTextEntry={editType === 'password'}
              autoCapitalize={editType === 'name' ? 'words' : 'none'}
              className="bg-slate-800 text-white p-4 rounded-xl border border-slate-700 mb-6 text-lg"
              autoFocus
            />

            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setEditModalVisible(false)} disabled={isBusy} className="flex-1 bg-slate-800 p-4 rounded-xl">
                <Text className="text-slate-300 font-bold text-center">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdate} disabled={isBusy} className="flex-1 bg-blue-600 p-4 rounded-xl">
                {isBusy ? <ActivityIndicator color="white" /> : (
                  <View className="flex-row items-center justify-center gap-2">
                    <Save size={18} color="white" />
                    <Text className="text-white font-bold text-center">{t('common.save')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DownloadReportModal
        visible={isReportModalVisible}
        onClose={() => setIsReportModalVisible(false)}
      />
    </SafeAreaView>
  );
}
