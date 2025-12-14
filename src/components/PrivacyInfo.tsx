import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { X, Database, Lock, UserCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface PrivacyInfoProps {
  visible: boolean; // <--- ADDED
  onClose: () => void;
}

function PrivacyInfo({ visible, onClose }: PrivacyInfoProps) {
  const { t } = useTranslation();

  // Safe retrieval of the array. If translation loads string or null, default to empty array to prevent crash.
  const rawDataPoints = t('privacyDataPoints', { returnObjects: true });
  const dataPoints: string[] = Array.isArray(rawDataPoints) ? rawDataPoints : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/75 p-4">
        <View className="bg-slate-800 rounded-2xl w-full h-[90%]">

          {/* Header */}
          <View className="rounded-t-2xl border-b border-slate-700 p-6 flex-row justify-between items-center">
            <Text className="text-2xl font-bold text-white">{t('privacyTitle')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-lg">
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView contentContainerStyle={{ padding: 24 }}>

            <View className="bg-blue-900/40 rounded-xl p-5 border border-blue-600 mb-6">
              <Text className="text-xl font-bold text-blue-400 mb-3">{t('privacySubtitle')}</Text>
              <Text className="text-slate-200">{t('privacyIntro')}</Text>
            </View>

            <View className="bg-slate-900 rounded-xl p-5 border border-slate-700 mb-6">
              <View className="flex-row items-start gap-3 mb-3">
                <Database color="#60a5fa" size={24} />
                <View className="flex-1">
                  <Text className="text-lg font-bold text-white mb-2">{t('privacyDataCollectedTitle')}</Text>
                  <Text className="text-slate-300 text-sm mb-2">{t('privacyDataCollectedDesc')}</Text>
                  <View className="space-y-1">
                    {dataPoints.map((point, index) => (
                      <View key={index} className="flex-row items-start gap-2 mt-1">
                        <Text className="text-blue-400 font-bold">•</Text>
                        <Text className="text-slate-300 text-sm flex-1">{point}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View className="bg-slate-900 rounded-xl p-5 border border-slate-700 mb-6">
              <View className="flex-row items-start gap-3 mb-3">
                <Lock color="#60a5fa" size={24} />
                <View className="flex-1">
                  <Text className="text-lg font-bold text-white mb-2">{t('privacyStorageTitle')}</Text>
                  <Text className="text-slate-300 text-sm">{t('privacyStorageDesc')}</Text>
                </View>
              </View>
            </View>

            <View className="bg-slate-900 rounded-xl p-5 border border-slate-700 mb-6">
              <View className="flex-row items-start gap-3 mb-3">
                <UserCheck color="#60a5fa" size={24} />
                <View className="flex-1">
                  <Text className="text-lg font-bold text-white mb-2">{t('privacyControlTitle')}</Text>
                  <Text className="text-slate-300 text-sm">{t('privacyControlDesc')}</Text>
                </View>
              </View>
            </View>

            <View className="bg-amber-900/30 rounded-xl p-5 border border-amber-600 mb-6">
              <Text className="text-slate-200 text-sm">
                <Text className="text-amber-400 font-bold">⚠️ {t('privacyDisclaimer')}</Text>
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="rounded-b-2xl border-t border-slate-700 p-6">
            <TouchableOpacity onPress={onClose} className="w-full px-6 py-3 bg-blue-600 rounded-lg">
              <Text className="text-white font-semibold text-center">{t('close')}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

export default PrivacyInfo;
