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
  Image,
} from 'react-native';
import { X, Check, AlertTriangle, Info, Truck, Plus, Camera, Trash2 } from 'react-native-feather';
import * as ImagePicker from 'expo-image-picker';
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
  const [defectPhotos, setDefectPhotos] = useState<{ uri: string; storagePath?: string; dbId?: string }[]>([]);

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

  const loadCheck = async (check: any) => {
    setCurrentCheckId(check.id);
    setReg(check.reg_number);
    setTrailerReg(check.trailer_reg || '');
    setVehicleType(check.vehicle_type);
    setPullingTrailer(!!check.trailer_reg);
    setVehicleMake(check.vehicle_make || '');
    setOdometer(check.odometer_reading?.toString() || '');
    setAnswers(check.items || {});
    setDefectDetails(check.defect_details || '');

    // Fetch any previously attached defect photos
    const { data: photoData } = await supabase
      .from('defect_photos')
      .select('id, storage_path')
      .eq('vehicle_check_id', check.id);

    if (photoData && photoData.length > 0) {
      const photos = photoData.map((p: any) => {
        const { data: urlData } = supabase.storage
          .from('defect-photos')
          .getPublicUrl(p.storage_path);
        return { uri: urlData.publicUrl, storagePath: p.storage_path, dbId: p.id };
      });
      setDefectPhotos(photos);
    } else {
      setDefectPhotos([]);
    }
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
    setDefectPhotos([]);
  };

  const pickDefectPhoto = async (source: 'camera' | 'gallery') => {
    if (defectPhotos.length >= 3) {
      Alert.alert('Photo Limit', 'You can attach a maximum of 3 photos per defect report.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          allowsEditing: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
        });

    if (!result.canceled && result.assets?.[0]) {
      setDefectPhotos(prev => [...prev, { uri: result.assets[0].uri }]);
    }
  };

  const removeDefectPhoto = async (index: number) => {
    const photo = defectPhotos[index];
    // If already persisted to DB/storage, delete it
    if (photo.dbId) {
      await supabase.from('defect_photos').delete().eq('id', photo.dbId);
      if (photo.storagePath) {
        await supabase.storage.from('defect-photos').remove([photo.storagePath]);
      }
    }
    setDefectPhotos(prev => prev.filter((_, i) => i !== index));
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

      let checkId = currentCheckId;

      if (currentCheckId) {
        const { error } = await supabase.from('vehicle_checks').update(payload).eq('id', currentCheckId);
        if (error) throw error;
      } else {
        const { data: insertData, error } = await supabase
          .from('vehicle_checks')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        checkId = insertData.id;
      }

      // Upload any locally selected photos (those without storagePath are new)
      const newPhotos = defectPhotos.filter(p => !p.storagePath);
      if (newPhotos.length > 0 && checkId) {
        const companyPrefix = profile?.company_id || 'solo';
        for (const photo of newPhotos) {
          try {
            const ext = (photo.uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
            const storagePath = `${companyPrefix}/${checkId}/${Date.now()}.${ext}`;
            const response = await fetch(photo.uri);
            const blob = await response.blob();
            const { error: uploadError } = await supabase.storage
              .from('defect-photos')
              .upload(storagePath, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
            if (!uploadError) {
              await supabase.from('defect_photos').insert({
                vehicle_check_id: checkId,
                storage_path: storagePath,
              });
            }
          } catch (photoErr) {
            console.error('Photo upload failed:', photoErr);
            // Non-fatal: continue submitting even if a photo fails
          }
        }
      }

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
            <TextInput style={styles.input} placeholder={t('vehicleChecklist.registration')} placeholderTextColor="#94a3b8" value={reg} onChangeText={setReg} autoCapitalize="characters" autoComplete="off" autoCorrect={false} textContentType="none" importantForAutofill="no" />
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
                  onChangeText={setTrailerReg}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect={false}
                  textContentType="none"
                  importantForAutofill="no"
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
              <View style={styles.defectHeader}>
                <AlertTriangle size={20} color="#ef4444" />
                <Text style={styles.defectTitle}>{t('vehicleChecklist.defectReporting')}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('vehicleChecklist.defectPlaceholder')}
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
                value={defectDetails}
                onChangeText={setDefectDetails}
              />

              {/* Defect photo capture */}
              <View style={styles.photoSection}>
                <Text style={styles.photoSectionTitle}>
                  Defect Photos ({defectPhotos.length}/3)
                </Text>

                {defectPhotos.length > 0 && (
                  <View style={styles.photoGrid}>
                    {defectPhotos.map((photo, index) => (
                      <View key={index} style={styles.photoThumb}>
                        <Image source={{ uri: photo.uri }} style={styles.thumbImage} />
                        <TouchableOpacity
                          onPress={() => removeDefectPhoto(index)}
                          style={styles.removePhotoBtn}
                        >
                          <Trash2 size={12} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {defectPhotos.length < 3 && (
                  <View style={styles.photoButtons}>
                    <TouchableOpacity
                      onPress={() => pickDefectPhoto('camera')}
                      style={styles.photoBtn}
                    >
                      <Camera size={16} color="#60a5fa" />
                      <Text style={styles.photoBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => pickDefectPhoto('gallery')}
                      style={[styles.photoBtn, { marginLeft: 8 }]}
                    >
                      <Camera size={16} color="#94a3b8" />
                      <Text style={[styles.photoBtnText, { color: '#94a3b8' }]}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
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
  photoSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#7f1d1d', paddingTop: 12 },
  photoSectionTitle: { color: '#fca5a5', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  thumbImage: { width: '100%', height: '100%' },
  removePhotoBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(239,68,68,0.85)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  photoButtons: { flexDirection: 'row' },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' },
  photoBtnText: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
});
