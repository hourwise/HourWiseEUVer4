import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal } from 'react-native';
import { Settings, User, Globe, Clock, LogOut } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface SettingsMenuProps {
  onOpenDriverSetup: () => void;
  onOpenLanguageSelector: () => void;
}

export default function SettingsMenu({
  onOpenDriverSetup,
  onOpenLanguageSelector,
}: SettingsMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      t('signOut'),
      t('confirmSignOut'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('signOut'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
              Alert.alert(t('error'), error.message);
            }
          },
        },
      ]
    );
  };

  // Helper function to handle menu item presses
  const handlePress = (action: () => void) => {
    setIsOpen(false);
    // Use a short timeout to allow the modal to close before navigating
    setTimeout(action, 100);
  };

  return (
    <View>
      {/* The main button to open the menu */}
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-white/10"
      >
        <Settings size={24} color="white" />
      </TouchableOpacity>

      {/* FIX: Use a Modal to guarantee the menu renders on top of everything */}
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        {/* Backdrop to close the menu */}
        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPressOut={() => setIsOpen(false)}
        >
          {/* The actual menu content */}
          <View className="absolute top-24 right-4 w-64 bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
            {/* Driver Setup */}
            <TouchableOpacity
              onPress={() => handlePress(onOpenDriverSetup)}
              className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700"
            >
              <User size={20} color="#94a3b8" />
              <Text className="text-slate-200 font-medium">{t('driverSettings')}</Text>
            </TouchableOpacity>

            {/* Language Selector */}
            <TouchableOpacity
              onPress={() => handlePress(onOpenLanguageSelector)}
              className="flex-row items-center gap-3 p-4 border-b border-slate-700 active:bg-slate-700"
            >
              <Globe size={20} color="#94a3b8" />
              <Text className="text-slate-200 font-medium">{t('selectLanguage')}</Text>
            </TouchableOpacity>

            {/* Timezone Info (Read Only) */}
            <View className="flex-row items-center gap-3 p-4 border-b border-slate-700 bg-slate-800/50">
              <Clock size={20} color="#64748b" />
              <View>
                <Text className="text-slate-400 text-xs">Timezone (Auto)</Text>
                <Text className="text-slate-500 text-xs w-48" numberOfLines={1}>
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </Text>
              </View>
            </View>

            {/* Logout Button */}
            <TouchableOpacity
              onPress={() => handlePress(handleLogout)}
              className="flex-row items-center gap-3 p-4 active:bg-red-900/20"
            >
              <LogOut size={20} color="#ef4444" />
              <Text className="text-red-400 font-medium">{t('signOut')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
