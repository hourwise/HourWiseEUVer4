import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { X, MapPin } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { regionalRules, Language } from '../lib/translations';

interface RegionalRulesModalProps {
  language: Language;
  onClose: () => void;
}

function RegionalRulesModal({ language, onClose }: RegionalRulesModalProps) {
  const { t } = useTranslation();
  const rulesData = regionalRules[language] || regionalRules.en;

  return (
    <View className="flex-1 justify-center items-center bg-black/75 p-4">
      <View className="bg-slate-800 rounded-2xl w-full h-[90%]">
        {/* Header */}
        <View className="border-b border-slate-700 p-6 flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <MapPin size={24} color="#60a5fa" />
            <Text className="text-2xl font-bold text-white">{t('regionalRules.title')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} className="p-2 rounded-lg">
            <X color="white" size={24} />
          </TouchableOpacity>
        </View>

        {/* Scrollable content */}
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          {Object.values(rulesData).map((country, index) => (
            <View key={index} className="mb-6 bg-slate-900 p-4 rounded-lg">
              <Text className="text-xl font-bold text-blue-400 mb-3">{country.country}</Text>
              <View className="space-y-2">
                {country.rules.map((rule, r_index) => (
                  <Text key={r_index} className="text-slate-300">• {rule}</Text>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Footer */}
        <View className="border-t border-slate-700 p-6">
          <TouchableOpacity
            onPress={onClose}
            className="w-full px-6 py-3 bg-blue-600 rounded-lg"
          >
            <Text className="text-white font-semibold text-center">{t('regionalRules.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default RegionalRulesModal;
