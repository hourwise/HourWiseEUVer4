import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Platform, Switch } from 'react-native';
import { X, User, DollarSign, Clock, Save, Trash2, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Session } from '@supabase/supabase-js';

type Unit = 'day' | 'week' | 'month';

interface AdditionalTier {
    id: string;
    threshold: string;
    unit: Unit;
    multiplier: string;
    percentage: string;
}

interface DriverSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  // FIX: t is explicitly defined as a function here
  session: Session;
}

const UNIT_LABEL: Record<Unit, string> = {
  day: 'Per Day',
  week: 'Per Week',
  month: 'Per Month'
};

const UNIT_ORDER: Unit[] = ['day', 'week', 'month'];

export default function DriverSetup({ isOpen, onClose, onSave, session }: DriverSetupProps) {
  const { t } = useTranslation();
  const [driverName, setDriverName] = useState('');

  const [hourlyRate, setHourlyRate] = useState('');
  const [shiftAllowance, setShiftAllowance] = useState('');
  const [overtimeThreshold, setOvertimeThreshold] = useState('');

  const [overtimeThresholdUnit, setOvertimeThresholdUnit] = useState<Unit>('day');

  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5');
  const [overtimePercentage, setOvertimePercentage] = useState('');
  const [unpaidBreak, setUnpaidBreak] = useState('');

  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [overtimeType, setOvertimeType] = useState<'multiplier' | 'percentage'>('multiplier');

  const [previousShiftEnd, setPreviousShiftEnd] = useState<Date | null>(null);
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);

  const [additionalTiers, setAdditionalTiers] = useState<AdditionalTier[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadExistingData = async () => {
      if (!session?.user) return;

      try {
        const { data: profile } = await supabase
            .from('driver_profiles')
            .select(`
                *,
                pay_configurations (*)
            `)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (isMounted) {
            if (profile) {
                setDriverName(profile.driver_name);
                setProfileId(profile.id);

                const payData = Array.isArray(profile.pay_configurations)
                    ? profile.pay_configurations[0]
                    : profile.pay_configurations;

                if (payData) {
                    setHourlyRate(payData.hourly_rate?.toString() || '');
                    setShiftAllowance(payData.shift_allowance?.toString() || '');
                    setOvertimeThreshold(payData.overtime_threshold_hours?.toString() || '');
                    setOvertimeThresholdUnit((payData.overtime_threshold_unit as Unit) || 'day');
                    setOvertimeMultiplier(payData.overtime_rate_multiplier?.toString() || '1.5');
                    setOvertimePercentage(payData.overtime_rate_percentage?.toString() || '');
                    setUnpaidBreak(payData.unpaid_break_minutes?.toString() || '');

                    if (payData.overtime_rate_percentage !== null) setOvertimeType('percentage');

                    if (payData.additional_overtime_tiers) {
                        const tiers = payData.additional_overtime_tiers.map((tier: any) => ({
                            id: Math.random().toString(),
                            threshold: tier.threshold.toString(),
                            unit: (tier.unit as Unit) || 'day',
                            multiplier: tier.multiplier?.toString() || '',
                            percentage: tier.percentage?.toString() || ''
                        }));
                        setAdditionalTiers(tiers);
                    }
                } else {
                    setIsFirstTime(true);
                }
            } else {
                setIsFirstTime(true);
            }
        }
      } catch (err) {
          console.error("Error loading data", err);
      }
    };

    if (isOpen) loadExistingData();

    return () => { isMounted = false; };
  }, [isOpen, session]);

  const handleClearData = useCallback(async () => {
      Alert.alert(
          t('resetData'), // UPDATED to function call
          t('confirmReset'), // UPDATED
          [
              { text: t('cancel'), style: 'cancel' }, // UPDATED
              {
                  text: t('delete'), // UPDATED
                  style: 'destructive',
                  onPress: async () => {
                      setDriverName('');
                      setHourlyRate('');
                      setShiftAllowance('');
                      setOvertimeThreshold('');
                      setOvertimeThresholdUnit('day');
                      setOvertimeMultiplier('1.5');
                      setUnpaidBreak('');
                      setAdditionalTiers([]);
                  }
              }
          ]
      );
  }, [t]);

  const handleSave = useCallback(async () => {
    if (!session?.user) {
      Alert.alert(t('error'), 'User not authenticated. Please restart the app.'); // UPDATED
      return;
    }
    if (!driverName.trim()) {
      Alert.alert(t('validationError'), t('pleaseEnterName')); // UPDATED
      return;
    }

    setLoading(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('driver_profiles')
        .upsert({
            user_id: session.user.id,
            driver_name: driverName
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (profileError || !profile) {
          console.error("Profile Save Error:", profileError);
          throw new Error("Couldn't create profile");
      }

      const formattedTiers = additionalTiers
        .map(tier => ({
            threshold: parseFloat(tier.threshold),
            unit: tier.unit,
            multiplier: overtimeType === 'multiplier' ? (parseFloat(tier.multiplier) || undefined) : undefined,
            percentage: overtimeType === 'percentage' ? (parseFloat(tier.percentage) || undefined) : undefined
        }))
        .filter(tier => !isNaN(tier.threshold));

      const payConfigToSave = {
        driver_profile_id: profile.id,
        user_id: session.user.id,
        hourly_rate: parseFloat(hourlyRate) || 0,
        shift_allowance: parseFloat(shiftAllowance) || 0,
        overtime_threshold_hours: overtimeThreshold ? parseFloat(overtimeThreshold) : null,
        overtime_threshold_unit: overtimeThresholdUnit,
        overtime_rate_multiplier: overtimeType === 'multiplier' ? (parseFloat(overtimeMultiplier) || null) : null,
        overtime_rate_percentage: overtimeType === 'percentage' ? (parseFloat(overtimePercentage) || null) : null,
        unpaid_break_minutes: parseFloat(unpaidBreak) || 0,
        additional_overtime_tiers: formattedTiers
      };

      const { error: payError } = await supabase
        .from('pay_configurations')
        .upsert(payConfigToSave, { onConflict: 'driver_profile_id' });

      if (payError) {
          console.error("Pay Config Save Error:", payError);
          throw new Error("Failed to save pay settings");
      }

      if (isFirstTime && previousShiftEnd) {
        const { count } = await supabase.from('work_sessions').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('is_manual_entry', true);

        if (count === 0) {
             await supabase.from('work_sessions').insert({
                 user_id: session.user.id,
                 end_time: previousShiftEnd.toISOString(),
                 is_manual_entry: true,
                 date: previousShiftEnd.toISOString().split('T')[0],
                 start_time: previousShiftEnd.toISOString()
             });
        }
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving driver data:', error);
      Alert.alert(t('error'), t('failedToSave')); // UPDATED
    } finally {
      setLoading(false);
    }
  }, [session, driverName, additionalTiers, overtimeType, hourlyRate, shiftAllowance, overtimeThreshold, overtimeThresholdUnit, overtimeMultiplier, overtimePercentage, unpaidBreak, isFirstTime, previousShiftEnd, onSave, onClose, t]);

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
        setShowDateTimePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setPreviousShiftEnd(selectedDate);
    }
  };

  const addTier = useCallback(() => {
      setAdditionalTiers(prev => [...prev, { id: Math.random().toString(), threshold: '', unit: 'day', multiplier: '', percentage: '' }]);
  }, []);

  const removeTier = useCallback((id: string) => {
      setAdditionalTiers(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTier = useCallback((id: string, field: keyof AdditionalTier, value: string | Unit) => {
      setAdditionalTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  }, []);

  const cycleUnit = (current: Unit) => {
    const idx = UNIT_ORDER.indexOf(current);
    return UNIT_ORDER[(idx + 1) % UNIT_ORDER.length];
  };

  return (
    <Modal visible={isOpen} onRequestClose={onClose} transparent={true} animationType="slide">
      <View className="flex-1 justify-center items-center bg-black/50 p-4">
        <View style={{ maxHeight: '90%' }} className="bg-white rounded-lg shadow-xl w-full flex-1">
          <View className="bg-white border-b border-gray-200 px-6 py-4 flex-row items-center justify-between">
            {/* UPDATED t usages below */}
            <Text className="text-xl font-bold text-gray-900">{profileId ? t('driverSettings') : t('welcomeSetup')}</Text>
            <TouchableOpacity onPress={onClose} className="p-1"><X size={24} color="gray" /></TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
            {isFirstTime && (
              <View className="mb-6 p-4 bg-blue-100 rounded-lg">
                  <Text className="text-blue-800 text-sm">Welcome! Please set up your profile to get started.</Text>
              </View>
            )}
            <View className="space-y-6">

              {/* Personal Info */}
              <View className="space-y-4">
                <View className="flex-row items-center gap-2">
                  <User size={20} color="black" />
                  <Text className="text-lg font-semibold text-gray-900">{t('personalInformation')}</Text>
                </View>
                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-2">{t('driverName')} *</Text>
                  <TextInput value={driverName} onChangeText={setDriverName} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('enterFullName')} />
                </View>
              </View>

              {/* Pay Config */}
              <View className="space-y-4">
                <View className="flex-row items-center gap-2">
                    <DollarSign size={20} color="black" />
                    <Text className="text-lg font-semibold text-gray-900">{t('payConfiguration')}</Text>
                </View>

                <View className="flex-row gap-4">
                    <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-700 mb-2">{t('hourlyRate')}</Text>
                        <TextInput
                            value={hourlyRate}
                            onChangeText={setHourlyRate}
                            keyboardType="numeric"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            placeholder="0.00"
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-700 mb-2">{t('shiftAllowance')}</Text>
                        <TextInput
                            value={shiftAllowance}
                            onChangeText={setShiftAllowance}
                            keyboardType="numeric"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            placeholder="0.00"
                        />
                    </View>
                </View>

                <View>
                    <Text className="text-sm font-medium text-gray-700 mb-2">{t('unpaidBreakDuration')}</Text>
                    <TextInput
                        value={unpaidBreak}
                        onChangeText={setUnpaidBreak}
                        keyboardType="numeric"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        placeholder="45"
                    />
                    <Text className="text-xs text-gray-500 mt-1">Minutes deducted from daily total before pay calculation.</Text>
                </View>

                <View className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <Text className="font-semibold mb-4">{t('overtimeRules')}</Text>

                    {/* Overtime Threshold */}
                    <View className="mb-4">
                        <Text className="text-sm font-medium text-gray-700 mb-2">{t('overtimeThreshold')}</Text>

                        <View className="flex-row items-center gap-2">
                             <View className="flex-1">
                                 <TextInput
                                     value={overtimeThreshold}
                                     onChangeText={setOvertimeThreshold}
                                     keyboardType="numeric"
                                     className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                                     placeholder="e.g. 8"
                                 />
                             </View>

                             <TouchableOpacity
                                 onPress={() => setOvertimeThresholdUnit(prev => cycleUnit(prev))}
                                 className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
                             >
                                 <Text className="text-sm text-gray-700 font-medium">{UNIT_LABEL[overtimeThresholdUnit]}</Text>
                             </TouchableOpacity>
                        </View>
                    </View>

                    {/* Rate Value Input */}
                    <View className="mb-4">
                        <Text className="text-sm font-medium text-gray-700 mb-2">{t('rateMultiplier')}</Text>
                        <TextInput
                            value={overtimeType === 'multiplier' ? overtimeMultiplier : overtimePercentage}
                            onChangeText={overtimeType === 'multiplier' ? setOvertimeMultiplier : setOvertimePercentage}
                            keyboardType="numeric"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                            placeholder="1.5"
                        />
                    </View>

                    <Text className="font-medium mb-2 mt-2">{t('addAnotherTier')}</Text>
                    {additionalTiers.map((tier, index) => (
                        <View key={tier.id} className="mb-3 p-2 border border-gray-200 rounded-lg bg-white">
                            <View className="flex-row gap-2 mb-2 items-end">
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-500">After Hours</Text>
                                    <TextInput
                                        value={tier.threshold}
                                        onChangeText={(v) => updateTier(tier.id, 'threshold', v)}
                                        keyboardType="numeric"
                                        className="px-2 py-1 border border-gray-300 rounded bg-white"
                                    />
                                </View>

                                <TouchableOpacity
                                     onPress={() => updateTier(tier.id, 'unit', cycleUnit(tier.unit))}
                                     className="px-3 py-2 border border-gray-300 rounded bg-white self-start"
                                 >
                                     <Text className="text-sm text-gray-700">{UNIT_LABEL[tier.unit]}</Text>
                                 </TouchableOpacity>
                            </View>

                            <View className="flex-row gap-2 items-end">
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-500">Multiplier</Text>
                                    <TextInput
                                        value={overtimeType === 'multiplier' ? tier.multiplier : tier.percentage}
                                        onChangeText={(v) => updateTier(tier.id, overtimeType === 'multiplier' ? 'multiplier' : 'percentage', v)}
                                        keyboardType="numeric"
                                        className="px-2 py-1 border border-gray-300 rounded bg-white"
                                    />
                                </View>
                                <TouchableOpacity onPress={() => removeTier(tier.id)} className="p-2 bg-red-100 rounded">
                                    <Trash2 size={16} color="red" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity onPress={addTier} className="flex-row items-center justify-center p-2 mt-2 border border-dashed border-gray-400 rounded-lg">
                        <Plus size={16} color="gray" className="mr-2" />
                        <Text className="text-gray-600">{t('addAnotherTier')}</Text>
                    </TouchableOpacity>
                </View>
              </View>

            </View>
          </ScrollView>

          <View className="p-4 border-t border-gray-200 flex-row gap-3">
             <TouchableOpacity onPress={handleClearData} className="p-4 rounded-lg bg-red-50 mr-auto border border-red-200">
                 <Trash2 size={20} color="#dc2626" />
             </TouchableOpacity>

             <TouchableOpacity onPress={onClose} className="flex-1 p-4 rounded-lg bg-gray-100">
                <Text className="text-center font-bold text-gray-700">{t('cancel')}</Text>
             </TouchableOpacity>

             <TouchableOpacity
                onPress={handleSave}
                disabled={loading}
                className="flex-1 p-4 rounded-lg bg-blue-600 shadow-sm"
             >
                <Text className="text-center font-bold" style={{ color: 'white' }}>
                    {loading ? 'Saving...' : t('save')}
                </Text>
             </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
