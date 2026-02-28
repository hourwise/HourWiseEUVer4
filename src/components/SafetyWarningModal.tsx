import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AlertTriangle } from 'react-native-feather';
import { useTranslation } from 'react-i18next'; // Import the hook

interface SafetyWarningModalProps {
  onClose: () => void;
}

// The component no longer receives 't' as a prop
export default function SafetyWarningModal({ onClose }: SafetyWarningModalProps) {
  // Call the hook inside the component to get the 't' function
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-black/80 justify-center items-center p-6">
      <View className="bg-slate-900 p-6 rounded-2xl border border-red-500 w-full max-w-sm items-center">

        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: 16 }} />

        <Text className="text-xl font-bold text-white mb-2 text-center">
          {t('safetyWarning.title', 'Safety Warning')}
        </Text>

        <Text className="text-slate-300 text-center mb-6 leading-6">
          {t('safetyWarning.body', 'Do not interact with the app while driving. Stop safely before making changes.')}
        </Text>

        <TouchableOpacity
          onPress={onClose}
          className="bg-red-600 w-full py-3 rounded-xl"
        >
          <Text className="text-white font-bold text-center text-lg">
            {t('safetyWarning.acknowledge', 'I Understand')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
