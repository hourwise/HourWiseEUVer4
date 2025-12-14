import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList } from 'react-native';
import { X, Check } from 'lucide-react-native';

interface LanguageSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectLanguage: (lang: string) => void;
  currentLanguage: string;
}

// Update this list to match your i18n.js supportedLngs
const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
];

export default function LanguageSelector({ visible, onClose, onSelectLanguage, currentLanguage }: LanguageSelectorProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/70 p-4">
        <View className="bg-slate-900 w-full max-w-sm rounded-2xl overflow-hidden border border-slate-700">

          {/* Header */}
          <View className="flex-row justify-between items-center p-4 border-b border-slate-700 bg-slate-800">
            <Text className="text-white text-lg font-bold">Select Language</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* List */}
          <FlatList
            data={languages}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => {
              const isSelected = currentLanguage === item.code;
              return (
                <TouchableOpacity
                  onPress={() => {
                    onSelectLanguage(item.code);
                    onClose();
                  }}
                  className={`flex-row items-center justify-between p-4 border-b border-slate-800 ${
                    isSelected ? 'bg-blue-900/20' : ''
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Text className="text-2xl">{item.flag}</Text>
                    <Text className={`text-lg ${isSelected ? 'text-blue-400 font-bold' : 'text-white'}`}>
                      {item.name}
                    </Text>
                  </View>
                  {isSelected && <Check size={20} color="#60a5fa" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
