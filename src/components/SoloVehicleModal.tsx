import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, Save, Truck, Calendar, Shield, Tool, Activity, Info, RefreshCw } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addYears, parseISO } from 'date-fns';

interface SoloVehicleModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export default function SoloVehicleModal({ visible, onClose, userId }: SoloVehicleModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    reg_number: '',
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    vehicle_type: 'Van',
    vin_number: '',
    current_odometer: '',
    mot_due_date: null as string | null,
    pmi_due_date: null as string | null,
    tacho_calibration_due: null as string | null,
    loler_due_date: null as string | null,
    insurance_expiry: null as string | null,
  });

  const [showDatePicker, setShowDatePicker] = useState<string | null>(null);

  useEffect(() => {
    if (visible && userId) {
      loadVehicle();
    }
  }, [visible, userId]);

  const loadVehicle = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setFormData({
          reg_number: data.reg_number || '',
          make: data.make || '',
          model: data.model || '',
          year: data.year?.toString() || new Date().getFullYear().toString(),
          vehicle_type: data.vehicle_type || 'Van',
          vin_number: data.vin_number || '',
          current_odometer: data.current_odometer?.toString() || '',
          mot_due_date: data.mot_due_date,
          pmi_due_date: data.pmi_due_date,
          tacho_calibration_due: data.tacho_calibration_due,
          loler_due_date: data.loler_due_date,
          insurance_expiry: data.insurance_expiry,
        });
      }
    } catch (error) {
      console.error('Error loading vehicle:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.reg_number) {
      Alert.alert(t('common.error'), t('vehicleManagement.alerts.regRequired'));
      return;
    }

    setSaving(true);
    try {
      const parsedYear = parseInt(formData.year, 10);
      const parsedOdo = parseInt(formData.current_odometer, 10);

      const payload = {
        user_id: userId,
        company_id: null,
        reg_number: formData.reg_number.toUpperCase().trim(),
        make: (formData.make || '').trim() || null,
        model: (formData.model || '').trim() || null,
        year: isNaN(parsedYear) ? null : parsedYear,
        vehicle_type: formData.vehicle_type,
        vin_number: (formData.vin_number || '').trim() || null,
        current_odometer: isNaN(parsedOdo) ? 0 : parsedOdo,
        mot_due_date: formData.mot_due_date || null,
        pmi_due_date: formData.pmi_due_date || null,
        tacho_calibration_due: formData.tacho_calibration_due || null,
        loler_due_date: formData.loler_due_date || null,
        insurance_expiry: formData.insurance_expiry || null,
        is_vor: false,
      };

      const { error } = await supabase
        .from('vehicles')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;

      Alert.alert(t('common.success'), t('vehicleManagement.alerts.saveSuccess'));
      onClose();
    } catch (error: any) {
      console.error('Save failed:', error?.message || error);
      Alert.alert(
        t('common.error'),
        error?.code === '23505'
          ? t('vehicleManagement.alerts.duplicateReg')
          : (error?.message || t('vehicleManagement.alerts.saveError'))
      );
    } finally {
      setSaving(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const field = showDatePicker; // Capture current field immediately

    if (event.type === 'set' && selectedDate && field) {
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      setFormData(prev => ({ ...prev, [field]: dateString }));

      // On Android, we must close the picker manually after 'set'
      if (Platform.OS === 'android') {
        setShowDatePicker(null);
      }
    } else if (event.type === 'dismissed') {
      setShowDatePicker(null);
    }
  };

  const renewDate = (field: keyof typeof formData, years: number) => {
    const current = formData[field] ? parseISO(formData[field] as string) : new Date();
    const next = addYears(current, years);
    const dateString = format(next, 'yyyy-MM-dd');
    setFormData(prev => ({ ...prev, [field]: dateString }));
    Alert.alert("Date Updated", `${format(next, 'dd/MM/yyyy')} set as new due date. Don't forget to save!`);
  };

  const renderDateField = (label: string, field: keyof typeof formData, icon: React.ReactNode, canRenew?: boolean) => (
    <View className="mb-4">
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-slate-400 text-xs font-bold uppercase">{label}</Text>
        {formData[field] && (
          <TouchableOpacity onPress={() => setFormData(prev => ({ ...prev, [field]: null }))}>
            <Text className="text-red-500 text-[10px] font-bold uppercase">Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => setShowDatePicker(field)}
          className="flex-1 flex-row items-center justify-between bg-slate-800 p-3.5 rounded-xl border border-slate-700"
        >
          <View className="flex-row items-center gap-3">
            {icon}
            <Text className={formData[field] ? "text-white font-medium" : "text-slate-500"}>
              {formData[field] ? format(parseISO(formData[field] as string), 'dd/MM/yyyy') : t('vehicleManagement.selectDate')}
            </Text>
          </View>
          <Calendar size={18} color="#64748b" />
        </TouchableOpacity>

        {canRenew && formData[field] && (
          <TouchableOpacity
            onPress={() => renewDate(field, field === 'tacho_calibration_due' ? 2 : 1)}
            className="bg-blue-600/20 border border-blue-500/50 px-3 items-center justify-center rounded-xl"
          >
            <RefreshCw size={16} color="#60a5fa" />
            <Text className="text-blue-400 text-[8px] font-bold uppercase mt-0.5">{field === 'tacho_calibration_due' ? '+2Y' : '+1Y'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 justify-end">
        <View className="bg-slate-900 rounded-t-3xl h-[90%] border-t border-slate-700">
          <View className="p-6 border-b border-slate-800 flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
              <Truck size={24} color="#60a5fa" />
              <Text className="text-xl font-bold text-white">{t('vehicleManagement.title')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 bg-slate-800 rounded-full">
              <X size={20} color="white" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#60a5fa" />
            </View>
          ) : (
            <ScrollView className="flex-1 p-6">
              <View className="space-y-6">
                <View>
                  <Text className="text-blue-500 text-[10px] font-black uppercase mb-4 border-b border-blue-900/30 pb-2">{t('vehicleManagement.sections.identity')}</Text>

                  <View className="mb-4">
                    <Text className="text-slate-400 text-xs font-bold uppercase mb-1.5">{t('vehicleManagement.fields.registration.label')}</Text>
                    <TextInput
                      className="bg-slate-800 text-white p-3.5 rounded-xl border border-slate-700 font-bold uppercase"
                      placeholder={t('vehicleManagement.fields.registration.placeholder')}
                      placeholderTextColor="#475569"
                      value={formData.reg_number}
                      onChangeText={text => setFormData({ ...formData, reg_number: text.toUpperCase() })}
                    />
                  </View>

                  <View className="flex-row gap-4 mb-4">
                    <View className="flex-1">
                      <Text className="text-slate-400 text-xs font-bold uppercase mb-1.5">{t('vehicleManagement.fields.make.label')}</Text>
                      <TextInput
                        className="bg-slate-800 text-white p-3.5 rounded-xl border border-slate-700"
                        placeholder={t('vehicleManagement.fields.make.placeholder')}
                        placeholderTextColor="#475569"
                        value={formData.make}
                        onChangeText={text => setFormData({ ...formData, make: text })}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-400 text-xs font-bold uppercase mb-1.5">{t('vehicleManagement.fields.model.label')}</Text>
                      <TextInput
                        className="bg-slate-800 text-white p-3.5 rounded-xl border border-slate-700"
                        placeholder={t('vehicleManagement.fields.model.placeholder')}
                        placeholderTextColor="#475569"
                        value={formData.model}
                        onChangeText={text => setFormData({ ...formData, model: text })}
                      />
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text className="text-slate-400 text-xs font-bold uppercase mb-1.5">{t('vehicleManagement.fields.type')}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {['Van', '7.5t', 'Class 2', 'Class 1'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          onPress={() => setFormData({ ...formData, vehicle_type: type })}
                          className={`px-4 py-2 rounded-full border ${formData.vehicle_type === type ? 'bg-blue-600 border-blue-500' : 'bg-slate-800 border-slate-700'}`}
                        >
                          <Text className={`text-xs font-bold ${formData.vehicle_type === type ? 'text-white' : 'text-slate-400'}`}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text className="text-slate-400 text-xs font-bold uppercase mb-1.5">{t('vehicleManagement.fields.odometer.label')}</Text>
                    <View className="flex-row items-center bg-slate-800 rounded-xl border border-slate-700">
                      <View className="pl-4"><Activity size={18} color="#60a5fa" /></View>
                      <TextInput
                        className="flex-1 text-white p-3.5 font-bold"
                        placeholder="0"
                        placeholderTextColor="#475569"
                        keyboardType="numeric"
                        value={formData.current_odometer}
                        onChangeText={text => setFormData({ ...formData, current_odometer: text })}
                      />
                      <Text className="pr-4 text-slate-500 font-bold">{t('vehicleManagement.fields.odometer.unit')}</Text>
                    </View>
                  </View>
                </View>

                <View className="mt-4">
                  <Text className="text-amber-500 text-[10px] font-black uppercase mb-4 border-b border-amber-900/30 pb-2">{t('vehicleManagement.sections.compliance')}</Text>

                  {renderDateField(t('vehicleManagement.fields.motDate'), 'mot_due_date', <Shield size={18} color="#f59e0b" />, true)}
                  {renderDateField(t('vehicleManagement.fields.pmiDate'), 'pmi_due_date', <Tool size={18} color="#f59e0b" />)}
                  {renderDateField(t('vehicleManagement.fields.tachoDate'), 'tacho_calibration_due', <Activity size={18} color="#f59e0b" />, true)}
                  {renderDateField(t('vehicleManagement.fields.lolerDate'), 'loler_due_date', <Tool size={18} color="#f59e0b" />, true)}
                  {renderDateField(t('vehicleManagement.fields.insuranceDate'), 'insurance_expiry', <Shield size={18} color="#10b981" />, true)}

                  <View className="bg-blue-900/20 p-4 rounded-xl border border-blue-800/30 flex-row gap-3">
                    <Info size={18} color="#60a5fa" />
                    <Text className="flex-1 text-blue-400 text-xs leading-relaxed">
                      {t('vehicleManagement.complianceNotice')}
                    </Text>
                  </View>
                </View>

                <View className="h-20" />
              </View>
            </ScrollView>
          )}

          <View className="p-6 border-t border-slate-800 bg-slate-900">
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-blue-600 p-4 rounded-xl flex-row items-center justify-center gap-2 shadow-lg shadow-blue-900/40"
            >
              {saving ? <ActivityIndicator color="white" /> : <Save size={20} color="white" />}
              <Text className="text-white font-bold text-lg">{t('vehicleManagement.saveButton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={formData[showDatePicker as keyof typeof formData] ? parseISO(formData[showDatePicker as keyof typeof formData] as string) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
        />
      )}
    </Modal>
  );
}
