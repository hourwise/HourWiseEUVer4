import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal } from 'react-native';
import { Settings, User, Globe, Clock, LogOut, Shield, Truck, Award } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../providers/AuthProvider';
import { useNavigation } from '@react-navigation/native';
import SoloQualificationsModal from './SoloQualificationsModal';

interface SettingsMenuProps {
  onOpenDriverSetup: () => void;
  onOpenLanguageSelector: () => void;
  onOpenBusinessProfile: () => void;
  onOpenSubscription: () => void;
  onOpenVehicleSettings: () => void;
}

export default function SettingsMenu({
  onOpenDriverSetup,
  onOpenLanguageSelector,
  onOpenBusinessProfile,
  onOpenSubscription,
  onOpenVehicleSettings,
}: SettingsMenuProps) {
  const { t } = useTranslation();
  const { signOut, profile } = useAuth();
  const navigation = useNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [showQuals, setShowQuals] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('signOut'),
      t('confirmSignOut'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('signOut'), style: 'destructive', onPress: signOut },
      ]
    );
  };

  const handlePress = (action: () => void) => {
    setIsOpen(false);
    setTimeout(action, 100);
  };

  const isSolo = profile?.account_type === 'solo';

  return (
    <View>
      <TouchableOpacity onPress={() => setIsOpen(true)} className="p-2">
        <Settings size={24} color="white" />
      </TouchableOpacity>

      <SoloQualificationsModal
        visible={showQuals}
        onClose={() => setShowQuals(false)}
        userId={profile?.id || ''}
      />

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <TouchableOpacity className="flex-1" activeOpacity={1} onPressOut={() => setIsOpen(false)}>
          <View className="absolute top-24 right-4 w-64 bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
            <TouchableOpacity onPress={() => handlePress(() => navigation.navigate('AccountManagement'))} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700">
                <Shield size={20} color="#94a3b8" />
                <Text className="text-slate-200 font-medium">{t('account.title', 'Account Management')}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handlePress(onOpenSubscription)} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700"><User size={20} color="#94a3b8" /><Text className="text-slate-200 font-medium">{t('settingsMenu.manageSubscription')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handlePress(onOpenBusinessProfile)} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700"><User size={20} color="#94a3b8" /><Text className="text-slate-200 font-medium">{t('settingsMenu.businessProfile')}</Text></TouchableOpacity>

            {isSolo && (
              <>
                <TouchableOpacity onPress={() => handlePress(onOpenVehicleSettings)} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700">
                  <Truck size={20} color="#60a5fa" />
                  <Text className="text-slate-200 font-medium">Vehicle Management</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handlePress(() => setShowQuals(true))} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700">
                  <Award size={20} color="#fbbf24" />
                  <Text className="text-slate-200 font-medium">Qualifications</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => handlePress(onOpenDriverSetup)} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700"><User size={20} color="#94a3b8" /><Text className="text-slate-200 font-medium">{t('settingsMenu.driverSettings')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handlePress(onOpenLanguageSelector)} className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700"><Globe size={20} color="#94a3b8" /><Text className="text-slate-200 font-medium">{t('settingsMenu.selectLanguage')}</Text></TouchableOpacity>
            <View className="flex-row items-center gap-3 p-4 border-b border-slate-700 bg-slate-800/50"><Clock size={20} color="#64748b" /><View><Text className="text-slate-400 text-xs">{t('settingsMenu.timezone.label')}</Text><Text className="text-slate-500 text-xs w-48" numberOfLines={1}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</Text></View></View>
            <TouchableOpacity onPress={() => handlePress(handleLogout)} className="flex-row items-center gap-3 p-4 active:bg-red-900/20"><LogOut size={20} color="#ef4444" /><Text className="text-red-400 font-medium">{t('settingsMenu.signOut.action')}</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
