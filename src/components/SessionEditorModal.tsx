import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform, TextInput, ScrollView, Modal } from 'react-native';
import { X, Save } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
// 1. Import the useTranslation hook
import { useTranslation } from 'react-i18next';

interface Session {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  total_break_minutes: number;
  total_poa_minutes: number;
}

interface SessionEditorModalProps {
  onClose: () => void;
  onSave: () => void;
  sessionToEdit: Session | null;
  selectedDate: string | null;
  visible: boolean; // Control visibility from the parent
}

export default function SessionEditorModal({ onClose, onSave, sessionToEdit, selectedDate, visible }: SessionEditorModalProps) {
  // 2. Get the 't' function from the hook
  const { t } = useTranslation();

  const getInitialDate = () => {
    if (sessionToEdit) return new Date(sessionToEdit.start_time);
    if (selectedDate) {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const d = new Date();
      d.setFullYear(year, month - 1, day);
      d.setHours(9, 0, 0, 0); // Default 9 AM
      return d;
    }
    return new Date();
  };

  const getInitialEndDate = () => {
    if (sessionToEdit) return new Date(sessionToEdit.end_time);
    const d = getInitialDate();
    d.setHours(17, 0, 0, 0); // Default 5 PM
    return d;
  };

  const [startDateTime, setStartDateTime] = useState(getInitialDate);
  const [endDateTime, setEndDateTime] = useState(getInitialEndDate);

  const [totalBreakMinutes, setTotalBreakMinutes] = useState('0');
  const [totalPoaMinutes, setTotalPoaMinutes] = useState('0');

  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [showPicker, setShowPicker] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<'start' | 'end'>('start');

  useEffect(() => {
    if (sessionToEdit) {
      setStartDateTime(new Date(sessionToEdit.start_time));
      setEndDateTime(new Date(sessionToEdit.end_time));
      setTotalBreakMinutes(sessionToEdit.total_break_minutes?.toString() || '0');
      setTotalPoaMinutes(sessionToEdit.total_poa_minutes?.toString() || '0');
    } else if (selectedDate) {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const newStart = new Date();
      newStart.setFullYear(year, month - 1, day);
      newStart.setHours(9, 0, 0, 0);

      const newEnd = new Date();
      newEnd.setFullYear(year, month - 1, day);
      newEnd.setHours(17, 0, 0, 0);

      setStartDateTime(newStart);
      setEndDateTime(newEnd);
      setTotalBreakMinutes('0');
      setTotalPoaMinutes('0');
    }
  }, [sessionToEdit, selectedDate]);

  const handleDateChange = (event: any, selected: Date | undefined) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (!selected) return;

    if (pickerMode === 'date') {
      const applyDate = (target: Date, source: Date) => {
        const d = new Date(target);
        d.setFullYear(source.getFullYear(), source.getMonth(), source.getDate());
        return d;
      };
      setStartDateTime(prev => applyDate(prev, selected));
      setEndDateTime(prev => applyDate(prev, selected));
    } else {
      if (activeTimeField === 'start') setStartDateTime(selected);
      else setEndDateTime(selected);
    }
  };

  const showMode = (mode: 'date' | 'time', field?: 'start' | 'end') => {
    setPickerMode(mode);
    if (field) setActiveTimeField(field);
    setShowPicker(true);
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const finalStart = new Date(startDateTime);
    let finalEnd = new Date(endDateTime);

    if (finalEnd.getTime() < finalStart.getTime()) {
      finalEnd.setDate(finalEnd.getDate() + 1);
    }

    const breakMinutes = parseInt(totalBreakMinutes, 10) || 0;
    const poaMinutes = parseInt(totalPoaMinutes, 10) || 0;
    const grossWorkMinutes = (finalEnd.getTime() - finalStart.getTime()) / (1000 * 60);

    const sessionData = {
      user_id: user.id,
      date: finalStart.toISOString().split('T')[0],
      start_time: finalStart.toISOString(),
      end_time: finalEnd.toISOString(),
      total_work_minutes: Math.max(0, grossWorkMinutes - breakMinutes - poaMinutes),
      total_break_minutes: breakMinutes,
      total_poa_minutes: poaMinutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      is_manual_entry: true
    };

    let error;
    if (sessionToEdit) {
      const { error: updateError } = await supabase.from('work_sessions').update(sessionData).eq('id', sessionToEdit.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('work_sessions').insert([sessionData]);
      error = insertError;
    }

    if (error) {
      // 3. Use correct translation syntax for alerts
      Alert.alert(t('error'), t('failedToSave'));
      console.error(error);
    } else {
      onSave();
      onClose();
    }
  };

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 justify-center items-center p-4">
        <View className="p-6 bg-slate-800 rounded-lg w-full max-h-[90%]">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-bold text-white">{sessionToEdit ? t('editShift') : t('addShift')}</Text>
            <TouchableOpacity onPress={onClose}><X color="white" size={24} /></TouchableOpacity>
          </View>

          <ScrollView>
            <TouchableOpacity onPress={() => showMode('date')} className="bg-slate-700 p-3 rounded-lg mb-4">
              <Text className="text-gray-400 text-xs mb-1">{t('date')}</Text>
              <Text className="text-white text-lg">{startDateTime.toLocaleDateString()}</Text>
            </TouchableOpacity>

            <View className="flex-row gap-4 mb-4">
              <View className="flex-1">
                <TouchableOpacity onPress={() => showMode('time', 'start')} className="bg-slate-700 p-3 rounded-lg">
                  <Text className="text-gray-400 text-xs mb-1">{t('startTime')}</Text>
                  <Text className="text-white text-xl font-semibold text-center">{formatTime(startDateTime)}</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-1">
                <TouchableOpacity onPress={() => showMode('time', 'end')} className="bg-slate-700 p-3 rounded-lg">
                  <Text className="text-gray-400 text-xs mb-1">{t('endTime')}</Text>
                  <Text className="text-white text-xl font-semibold text-center">{formatTime(endDateTime)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {showPicker && (
              <DateTimePicker
                value={pickerMode === 'date' ? startDateTime : (activeTimeField === 'start' ? startDateTime : endDateTime)}
                mode={pickerMode}
                is24Hour
                display="default"
                onChange={handleDateChange}
              />
            )}

            <View className="mb-4">
              <Text className="text-white mb-2">{t('totalBreakTime')} ({t('minutes')})</Text>
              <TextInput
                className="bg-slate-700 p-3 rounded-lg text-white"
                keyboardType="numeric"
                value={totalBreakMinutes}
                onChangeText={setTotalBreakMinutes}
                maxLength={3}
              />
            </View>

            <View className="mb-6">
              <Text className="text-white mb-2">{t('totalPOATime')} ({t('minutes')})</Text>
              <TextInput
                className="bg-slate-700 p-3 rounded-lg text-white"
                keyboardType="numeric"
                value={totalPoaMinutes}
                onChangeText={setTotalPoaMinutes}
                maxLength={3}
              />
            </View>

            <TouchableOpacity onPress={handleSave} className="bg-green-600 p-4 rounded-lg flex-row items-center justify-center gap-2">
              <Save size={20} color="white" />
              <Text className="text-white font-bold text-lg">{sessionToEdit ? t('updateShift') : t('save')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
