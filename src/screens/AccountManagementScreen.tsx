import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, SafeAreaView, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, User, Mail, Lock, Download, Trash2, LogOut, CreditCard } from 'react-native-feather';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import DownloadReportModal from '../components/DownloadReportModal'; // Import the modal

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
  const { user, signOut } = useAuth();
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);

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
              // This function now triggers the "soft delete" or "archive" process on the backend
              const { error } = await supabase.functions.invoke('delete-user-data');
              if (error) throw error;
              Alert.alert(
                t('account.delete.requestSuccessTitle', "Deletion Requested"),
                t('account.delete.requestSuccessMessage', "Your account is now deactivated and pending final deletion by your fleet manager.")
              );
              await signOut();
            } catch (error: any) {
              Alert.alert(t('common.error'), t('account.delete.errorMessage', "We could not process your deletion request at this time. Please contact support."));
              console.error('Account deletion request error:', error.message);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-900">
      <View className="flex-row items-center p-4 border-b border-slate-700">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2">
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-xl text-white font-bold text-center flex-1 pr-10">{t('account.title', 'Account Management')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <SectionHeader title={t('account.profileSection', 'Profile')} />
        <View className="space-y-3">
          <MenuItem label={t('account.editName', 'Edit Full Name')} icon={<User color="white" />} onPress={() => { /* Placeholder */ }} />
          <MenuItem label={t('account.changeEmail', 'Change Email')} icon={<Mail color="white" />} onPress={() => { /* Placeholder */ }} />
          <MenuItem label={t('account.changePassword', 'Change Password')} icon={<Lock color="white" />} onPress={() => { /* Placeholder */ }} />
        </View>

        <SectionHeader title={t('account.dataSection', 'Data Management')} />
        <View className="space-y-3">
          <MenuItem label={t('account.exportData', 'Export My Data')} icon={<Download color="white" />} onPress={() => setIsReportModalVisible(true)} />
          <MenuItem label={t('account.manageSubscription', 'Manage My Subscription')} icon={<CreditCard color="white" />} onPress={() => navigation.navigate('Paywall')} />
        </View>

        <SectionHeader title={t('account.dangerZone', 'Danger Zone')} />
        <View className="space-y-3 p-4 rounded-lg border border-red-500/50 bg-red-900/20">
          <MenuItem label={t('common.logout', 'Sign Out')} icon={<LogOut color="white" />} onPress={signOut} />
          <MenuItem label={t('account.delete.title', 'Delete My Account')} icon={<Trash2 color="#f87171" />} onPress={handleDeleteAccount} isDestructive />
        </View>
      </ScrollView>

      {/* Re-use the existing DownloadReportModal */}
      <DownloadReportModal
        visible={isReportModalVisible}
        onClose={() => setIsReportModalVisible(false)}
      />
    </SafeAreaView>
  );
}
