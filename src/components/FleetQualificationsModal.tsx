import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Platform,
} from 'react-native';
import { X, Camera, Save, CreditCard, Shield, Award, Clock } from 'react-native-feather';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ocrService } from '../services/ocrService';
import { driverDocumentService } from '../services/driverDocumentService';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  companyId: string;
}

type DocType = 'HGV_Licence' | 'CPC_Card' | 'Tacho_Card';

export default function FleetQualificationsModal({ visible, onClose, userId, companyId }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [selectedType, setSelectedType] = useState<DocType | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [idNumber, setIdNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    if (visible) {
      reset();
    }
  }, [visible]);

  const reset = () => {
    setStep('select');
    setSelectedType(null);
    setImageUri(null);
    setIdNumber('');
    setExpiryDate('');
    setLoading(false);
  };

  const handleOcr = async (uri: string, type: DocType) => {
    setLoading(true);
    try {
      const text = await ocrService.parseImage(uri);
      setIdNumber(ocrService.extractReferenceNumber(text, type) || '');
      setExpiryDate(ocrService.extractDate(text) || '');
    } catch (e) {
      console.warn('OCR failed:', e);
    } finally {
      setLoading(false);
      setStep('form');
    }
  };

  const takePhoto = async (type: DocType) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissions.cameraTitle'), t('qualifications.alerts.cameraRequired'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setSelectedType(type);
      await handleOcr(uri, type);
    }
  };

  const handleSave = async () => {
    if (!selectedType || !imageUri) return;
    setLoading(true);
    try {
      const storagePath = await driverDocumentService.uploadDocumentFile(
        imageUri,
        companyId,
        userId,
        selectedType
      );

      await driverDocumentService.addDocumentMetadata({
        user_id: userId,
        company_id: companyId,
        document_type: selectedType,
        storage_path: storagePath,
        id_number: idNumber,
        expiry_date: expiryDate,
        verified_at: null,
      });

      Alert.alert(t('common.success'), t('qualifications.alerts.uploadedPending'));
      onClose();
    } catch (e: any) {
      Alert.alert(t('qualifications.alerts.uploadError'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderSelect = () => (
    <View style={styles.menu}>
      <Text style={styles.subtitle}>{t('qualifications.selectDocumentType')}</Text>
      <TouchableOpacity style={styles.typeBtn} onPress={() => takePhoto('HGV_Licence')}>
        <Award size={24} color="#3b82f6" />
        <Text style={styles.typeBtnText}>{t('qualifications.docTypes.hgvLicence')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.typeBtn} onPress={() => takePhoto('CPC_Card')}>
        <Shield size={24} color="#f59e0b" />
        <Text style={styles.typeBtnText}>{t('qualifications.docTypes.cpcCard')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.typeBtn} onPress={() => takePhoto('Tacho_Card')}>
        <CreditCard size={24} color="#94a3b8" />
        <Text style={styles.typeBtnText}>{t('qualifications.docTypes.tachoCard')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderForm = () => (
    <ScrollView style={styles.form}>
      <View style={styles.previewContainer}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
        <View style={styles.pendingBadge}>
          <Clock size={14} color="#fbbf24" />
          <Text style={styles.pendingText}>{t('qualifications.pendingVerification')}</Text>
        </View>
      </View>

      <Text style={styles.label}>{t('qualifications.documentType')}</Text>
      <View style={styles.readOnlyInput}>
        <Text style={styles.readOnlyText}>{selectedType?.replace('_', ' ')}</Text>
      </View>

      <Text style={styles.label}>{t('qualifications.idCardNumber')}</Text>
      <TextInput
        style={styles.input}
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder={t('qualifications.extractedNumberPlaceholder')}
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
      />

      <Text style={styles.label}>{t('qualifications.expiryDateIso')}</Text>
      <TextInput
        style={styles.input}
        value={expiryDate}
        onChangeText={setExpiryDate}
        placeholder={t('qualifications.expiryDatePlaceholder')}
        placeholderTextColor="#64748b"
        keyboardType="numeric"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('qualifications.confirmUpload')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => setStep('select')}>
        <Text style={styles.backBtnText}>{t('qualifications.retakePhoto')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('qualifications.fleetUploadTitle')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {loading && step === 'select' ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>{t('qualifications.processingOcr')}</Text>
            </View>
          ) : (
            step === 'select' ? renderSelect() : renderForm()
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  menu: { padding: 20, gap: 16 },
  subtitle: { color: '#94a3b8', fontSize: 14, marginBottom: 10 },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  typeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  form: { padding: 20 },
  previewContainer: { marginBottom: 20, position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#1e293b' },
  pendingBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  pendingText: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold' },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  readOnlyInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  readOnlyText: { color: '#64748b', fontSize: 16, fontWeight: 'bold' },
  saveBtn: {
    backgroundColor: '#2563eb',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  backBtn: { padding: 16, alignItems: 'center' },
  backBtnText: { color: '#94a3b8', fontWeight: 'medium' },
  loadingOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 16 },
});
