import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { X, Check, AlertTriangle, Info, Truck, Plus } from 'react-native-feather';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const INTERNAL_CHECKS = [
  { id: 'mirrors', translationKey: 'mirrors', hintKey: 'mirrorsHint' },
  { id: 'wipers', translationKey: 'wipers', hintKey: 'wipersHint' },
  { id: 'front_view', translationKey: 'front_view', hintKey: 'front_viewHint' },
  { id: 'warning_lamps', translationKey: 'warning_lamps', hintKey: 'warning_lampsHint' },
  { id: 'steering', translationKey: 'steering', hintKey: 'steeringHint' },
  { id: 'horn', translationKey: 'horn', hintKey: 'hornHint' },
  { id: 'brakes_air', translationKey: 'brakes_air', hintKey: 'brakes_airHint' },
  { id: 'height_marker', translationKey: 'height_marker', hintKey: 'height_markerHint' },
  { id: 'seatbelts', translationKey: 'seatbelts', hintKey: 'seatbeltsHint' },
];

const EXTERNAL_CHECKS = [
  { id: 'lights_ind', translationKey: 'lights_ind', hintKey: 'lights_indHint' },
  { id: 'leaks', translationKey: 'leaks', hintKey: 'leaksHint' },
  { id: 'battery', translationKey: 'battery', hintKey: 'batteryHint' },
  { id: 'adblue', translationKey: 'adblue', hintKey: 'adblueHint' },
  { id: 'smoke', translationKey: 'smoke', hintKey: 'smokeHint' },
  { id: 'body_wings', translationKey: 'body_wings', hintKey: 'body_wingsHint' },
  { id: 'spray', translationKey: 'spray', hintKey: 'sprayHint' },
  { id: 'tyres_wheels', translationKey: 'tyres_wheels', hintKey: 'tyres_wheelsHint' },
  { id: 'brake_line', translationKey: 'brake_line', hintKey: 'brake_lineHint' },
  { id: 'electrical', translationKey: 'electrical', hintKey: 'electricalHint' },
  { id: 'coupling', translationKey: 'coupling', hintKey: 'couplingHint' },
  { id: 'load_security', translationKey: 'load_security', hintKey: 'load_securityHint' },
  { id: 'number_plate', translationKey: 'number_plate', hintKey: 'number_plateHint' },
  { id: 'reflectors', translationKey: 'reflectors', hintKey: 'reflectorsHint' },
  { id: 'markers', translationKey: 'markers', hintKey: 'markersHint' },
];

const TRAILER_CHECKS = [
  { id: 'trailer_id', translationKey: 'trailer_id', hintKey: 'trailer_idHint' },
  { id: 'trailer_tyres_wheels', translationKey: 'trailer_tyres', hintKey: 'trailer_tyresHint' },
  { id: 'trailer_brakes', translationKey: 'trailer_brakes', hintKey: 'trailer_brakesHint' },
  { id: 'trailer_lights', translationKey: 'trailer_lights', hintKey: 'trailer_lightsHint' },
  { id: 'trailer_coupling', translationKey: 'trailer_coupling', hintKey: 'trailer_couplingHint' },
  { id: 'trailer_legs', translationKey: 'trailer_legs', hintKey: 'trailer_legsHint' },
  { id: 'trailer_curtains_doors', translationKey: 'trailer_curtains', hintKey: 'trailer_curtainsHint' },
  { id: 'trailer_air_lines', translationKey: 'trailer_air_lines', hintKey: 'trailer_air_linesHint' },
  { id: 'trailer_load_security', translationKey: 'trailer_load', hintKey: 'trailer_loadHint' },
];

const VEHICLE_TYPES = ['Van', '7.5t', 'Class 2 (Rigid)', 'Class 1 (Artic)'];

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  profile: any;
  sessionId: string | null;
  onSuccess: () => void;
}

export default function VehicleChecklistModal({ visible, onClose, userId, profile, sessionId, onSuccess }: Props) {
  const { t } = useTranslation();
  const [existingChecks, setExistingChecks] = useState<any[]>([]);
  const [currentCheckId, setCurrentCheckId] = useState<string | null>(null);
  const [reg, setReg] = useState('');
  const [trailerReg, setTrailerReg] = useState('');
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[1]);
  const [pullingTrailer, setPullingTrailer] = useState(false);
  const [vehicleMake, setVehicleMake] = useState('');
  const [odometer, setOdometer] = useState('');
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [showHints, setShowHints] = useState<string | null>(null);
  const [defectDetails, setDefectDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isArtic = vehicleType === 'Class 1 (Artic)';

  const fetchSessionChecks = useCallback(async () => {
    if (!sessionId) {
        resetForm();
        return;
    }
    setIsLoading(true);
    const { data } = await supabase
      .from('vehicle_checks')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      setExistingChecks(data);
      loadCheck(data[0]);
    } else {
      resetForm();
    }
    setIsLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (visible) fetchSessionChecks();
  }, [visible, fetchSessionChecks]);

  const loadCheck = (check: any) => {
    setCurrentCheckId(check.id);
    setReg(check.reg_number);
    setTrailerReg(check.trailer_reg || '');
    setVehicleType(check.vehicle_type);
    setPullingTrailer(!!check.trailer_reg);
    setVehicleMake(check.vehicle_make || '');
    setOdometer(check.odometer_reading?.toString() || '');
    setAnswers(check.items || {});
    setDefectDetails(check.defect_details || '');
  };

  const resetForm = () => {
    setCurrentCheckId(null);
    setReg('');
    setTrailerReg('');
    setVehicleType(VEHICLE_TYPES[1]);
    setPullingTrailer(false);
    setVehicleMake('');
    setOdometer('');
    setAnswers({});
    setDefectDetails('');
  };

  const handleNewVehicle = () => {
    Alert.alert(t('vehicleChecklist.newVehicleTitle'), t('vehicleChecklist.newVehicleMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('vehicleChecklist.startNew'), onPress: resetForm }
    ]);
  };

  const hasDefects = Object.values(answers).some((val) => val === false);

  const getRequiredItems = () => {
    let items = [...INTERNAL_CHECKS, ...EXTERNAL_CHECKS];
    if (isArtic && pullingTrailer) items = [...items, ...TRAILER_CHECKS];
    return items;
  };

  const allAnswered = getRequiredItems().every((item) => answers[item.id] !== undefined);

  const handleSubmit = async () => {
    if (!reg) { Alert.alert(t('common.error'), t('vehicleChecklist.missingReg')); return; }
    if (isArtic && pullingTrailer && !trailerReg) { Alert.alert(t('common.error'), t('vehicleChecklist.missingTrailerReg')); return; }
    if (!allAnswered) { Alert.alert(t('common.error'), t('vehicleChecklist.incomplete')); return; }
    if (hasDefects && !defectDetails.trim()) { Alert.alert(t('common.error'), t('vehicleChecklist.missingDefectDetails')); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        driver_id: userId,
        company_id: profile?.company_id || null,
        session_id: sessionId,
        reg_number: reg,
        trailer_reg: (isArtic && pullingTrailer) ? trailerReg : null,
        vehicle_type: vehicleType,
        vehicle_make: vehicleMake || null,
        odometer_reading: parseInt(odometer, 10) || null,
        check_status: hasDefects ? 'defect' : 'pass',
        items: answers,
        defect_details: hasDefects ? defectDetails : null,
      };

      let error;
      if (currentCheckId) {
        ({ error } = await supabase.from('vehicle_checks').update(payload).eq('id', currentCheckId));
      } else {
        ({ error } = await supabase.from('vehicle_checks').insert(payload));
      }

      if (error) throw error;

      Alert.alert(t('vehicleChecklist.success'), t('vehicleChecklist.checkRecorded'));
      onSuccess();
      onClose();
    } catch (error) {
      Alert.alert(t('common.error'), t('vehicleChecklist.failedToSave'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderItem = (item: { id: string; translationKey: string; hintKey: string }) => (
    <View key={item.id} style={styles.itemContainer}>
      <View style={styles.itemHeader}>
        <View style={styles.labelContainer}>
          <Text style={styles.itemLabel}>{t(`vehicleChecklist.items.${item.translationKey}`)}</Text>
          <TouchableOpacity onPress={() => setShowHints(showHints === item.id ? null : item.id)}>
            <Info size={18} color="#3b82f6" />
          </TouchableOpacity>
        </View>
        <View style={styles.buttonGroup}>
          <TouchableOpacity onPress={() => setAnswers({ ...answers, [item.id]: true })} style={[styles.optionButton, answers[item.id] === true && styles.yesActive]}>
            <Check size={18} color={answers[item.id] === true ? '#fff' : '#94a3b8'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAnswers({ ...answers, [item.id]: false })} style={[styles.optionButton, answers[item.id] === false && styles.noActive]}>
            <X size={18} color={answers[item.id] === false ? '#fff' : '#94a3b8'} />
          </TouchableOpacity>
        </View>
      </View>
      {showHints === item.id && <View style={styles.hintBox}><Text style={styles.hintText}>{t(`vehicleChecklist.items.${item.hintKey}`)}</Text></View>}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Truck size={24} color="#60a5fa" />
            <Text style={styles.headerTitle}>{currentCheckId ? t('vehicleChecklist.updateTitle') : t('vehicleChecklist.title')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}><X size={24} color="#fff" /></TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContent}>
          {existingChecks.length > 0 && (
            <View style={styles.swapSection}>
              <Text style={styles.sectionTitle}>{t('vehicleChecklist.currentShiftVehicles')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.checkHistory}>
                {existingChecks.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => loadCheck(c)}
                    style={[styles.historyChip, currentCheckId === c.id && styles.historyChipActive]}
                  >
                    <Text style={[styles.historyText, currentCheckId === c.id && styles.historyTextActive]}>{c.reg_number}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={handleNewVehicle} style={styles.historyChipNew}>
                  <Plus size={14} color="#60a5fa" />
                  <Text style={styles.historyTextNew}>{t('vehicleChecklist.swapVehicle')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('vehicleChecklist.vehicleDetails')}</Text>
            <TextInput style={styles.input} placeholder={t('vehicleChecklist.registration')} placeholderTextColor="#94a3b8" value={reg} onChangeText={(t) => setReg(t.toUpperCase())} />
            <View style={styles.pickerContainer}>
              {VEHICLE_TYPES.map((t) => (
                <TouchableOpacity key={t} onPress={() => setVehicleType(t)} style={[styles.typeChip, vehicleType === t && styles.typeChipActive]}>
                  <Text style={[styles.typeText, vehicleType === t && styles.typeTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder={t('vehicleChecklist.vehicleMake')} placeholderTextColor="#94a3b8" value={vehicleMake} onChangeText={setVehicleMake} />
            <TextInput style={styles.input} placeholder={t('vehicleChecklist.odometer', 'Odometer Reading')} placeholderTextColor="#94a3b8" value={odometer} onChangeText={setOdometer} keyboardType="numeric" />
          </View>

          {isArtic && (
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t('vehicleChecklist.pullingTrailer')}</Text>
                <Switch
                  value={pullingTrailer}
                  onValueChange={setPullingTrailer}
                  trackColor={{ false: '#334155', true: '#3b82f6' }}
                  thumbColor={pullingTrailer ? '#fff' : '#94a3b8'}
                />
              </View>
              {pullingTrailer && (
                <TextInput
                  style={[styles.input, { marginTop: 12 }]}
                  placeholder={t('vehicleChecklist.trailerRegistration')}
                  placeholderTextColor="#94a3b8"
                  value={trailerReg}
                  onChangeText={(t) => setTrailerReg(t.toUpperCase())}
                />
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('vehicleChecklist.internalChecks')}</Text>
            {INTERNAL_CHECKS.map(renderItem)}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('vehicleChecklist.externalChecks')}</Text>
            {EXTERNAL_CHECKS.map(renderItem)}
          </View>

          {isArtic && pullingTrailer && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('vehicleChecklist.trailer')}</Text>
              {TRAILER_CHECKS.map(renderItem)}
            </View>
          )}

          {hasDefects && (
            <View style={styles.defectSection}>
              <View style={styles.defectHeader}><AlertTriangle size={20} color="#ef4444" /><Text style={styles.defectTitle}>{t('vehicleChecklist.defectReporting')}</Text></View>
              <TextInput style={[styles.input, styles.textArea]} placeholder={t('vehicleChecklist.defectPlaceholder')} placeholderTextColor="#94a3b8" multiline numberOfLines={4} value={defectDetails} onChangeText={setDefectDetails} />
            </View>
          )}

          <TouchableOpacity style={[styles.submitButton, (!allAnswered || !reg || (isArtic && pullingTrailer && !trailerReg)) && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{currentCheckId ? t('vehicleChecklist.updateReport') : t('vehicleChecklist.submitReport')}</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeButton: { padding: 4 },
  scrollContent: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 },
  input: { backgroundColor: '#1e293b', color: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#334155' },
  typeChipActive: { backgroundColor: '#3b82f6' },
  typeText: { color: '#94a3b8', fontSize: 12 },
  typeTextActive: { color: '#fff', fontWeight: 'bold' },
  itemContainer: { backgroundColor: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  itemLabel: { color: '#f1f5f9', fontSize: 15 },
  buttonGroup: { flexDirection: 'row', gap: 8 },
  optionButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  yesActive: { backgroundColor: '#22c55e' },
  noActive: { backgroundColor: '#ef4444' },
  hintBox: { marginTop: 8, backgroundColor: '#0f172a', padding: 8, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  hintText: { color: '#3b82f6', fontSize: 13, fontStyle: 'italic' },
  defectSection: { backgroundColor: '#450a0a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#991b1b', marginBottom: 24 },
  defectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  defectTitle: { color: '#f87171', fontWeight: 'bold', fontSize: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  submitButton: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#334155' },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  swapSection: { marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  checkHistory: { flexDirection: 'row', gap: 8 },
  historyChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', marginRight: 8 },
  historyChipActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  historyText: { color: '#94a3b8', fontSize: 13 },
  historyTextActive: { color: '#fff', fontWeight: 'bold' },
  historyChipNew: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyTextNew: { color: '#60a5fa', fontSize: 13 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  toggleLabel: { color: '#fff', fontSize: 16, fontWeight: '500' },
});
