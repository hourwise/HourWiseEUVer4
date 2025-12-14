import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { X, Globe, Check } from 'lucide-react-native';

// It's good practice to keep large constant arrays like this in a separate file (e.g., src/constants/timezones.ts)
const ALL_TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Budapest',
  'Europe/Prague',
  'Europe/Athens',
  'Europe/Bucharest',
  'Europe/Helsinki',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  // Add more as needed
];

interface TimezoneSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (timezone: string) => void;
  currentTimezone: string;
}

export default function TimezoneSelector({
  visible,
  onClose,
  onSelect,
  currentTimezone
}: TimezoneSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // UX Improvement: Reset search when the modal is closed/re-opened
  useEffect(() => {
    if (!visible) {
      setSearchTerm('');
    }
  }, [visible]);

  // Performance: Memoize the filtering logic so it only runs when the search term changes.
  const filteredTimezones = useMemo(() => {
    if (!searchTerm) return ALL_TIMEZONES;
    const lowerTerm = searchTerm.toLowerCase();
    return ALL_TIMEZONES.filter(tz =>
      tz.toLowerCase().includes(lowerTerm)
    );
  }, [searchTerm]);

  // Code Quality: Define renderItem outside the JSX for a stable function reference.
  const renderItem = ({ item }: { item: string }) => {
    const isSelected = currentTimezone === item;
    return (
      <TouchableOpacity
        onPress={() => {
          onSelect(item);
          onClose(); // Close modal immediately on selection for better UX
        }}
        accessibilityRole="button"
        accessibilityLabel={`Select timezone ${item}`}
        accessibilityState={{ selected: isSelected }}
        className={`py-4 px-6 border-b border-slate-700 flex-row justify-between items-center ${isSelected ? 'bg-slate-700/50' : ''}`}
      >
        <Text className={`text-lg ${isSelected ? 'text-blue-400 font-semibold' : 'text-slate-300'}`}>
          {item.replace(/_/g, ' ')}
        </Text>
        {/* UX Improvement: Add a checkmark for clearer visual selection */}
        {isSelected && <Check size={20} color="#60a5fa" />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* UX Improvement: Use KeyboardAvoidingView to prevent keyboard from covering UI */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center items-center bg-black/60 p-4"
      >
        <View className="bg-slate-800 rounded-2xl w-full max-w-md h-[80%] overflow-hidden shadow-xl">

          {/* Header */}
          <View className="border-b border-slate-700 p-5 flex-row justify-between items-center bg-slate-800">
            <View className="flex-row items-center gap-3">
              <Globe size={22} color="#60a5fa" />
              <Text className="text-xl font-bold text-white">Select Timezone</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 -mr-2 rounded-full active:bg-slate-700"
              accessibilityLabel="Close timezone selector"
              accessibilityRole="button"
            >
              <X color="#94a3b8" size={24} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="p-4 bg-slate-800">
            <TextInput
              className="bg-slate-900 p-3 rounded-xl text-white border border-slate-700 focus:border-blue-500"
              placeholder="Search timezone..."
              placeholderTextColor="#64748b"
              value={searchTerm}
              onChangeText={setSearchTerm}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* List */}
          <FlatList
            data={filteredTimezones}
            keyExtractor={item => item}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled" // UX: Allows tapping list items while keyboard is open
            initialNumToRender={15} // Performance tuning
            className="flex-1"
          />

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
