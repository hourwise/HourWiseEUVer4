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
  Linking,
} from 'react-native';
import { X, Camera, Save, CreditCard, Shield, Award, Trash2, Calendar, FileText as ImageIcon, Info } from 'react-native-feather';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ocrService } from '../services/ocrService';
import { driverDocumentService } from '../services/driverDocumentService';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface SoloQualificationsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

interface Qualification {
  id_number: string;
  expiry_date: string;
  image_url?: string;
}

export default function SoloQualificationsModal({ visible, onClose, userId }: SoloQualificationsModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [licence, setLicence] = useState<Qualification>({ id_number: '', expiry_date: '' });
  const [cpc, setCpc] = useState<Qualification>({ id_number: '', expiry_date: '' });
  const [tacho, setTacho] = useState<Qualification>({ id_number: '', expiry_date: '' });
  const [scanning, setScanning] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<{ type: 'licence' | 'cpc' | 'tacho' } | null>(null);

  useEffect(() => {
    if (visible) fetchQualifications();
  }, [visible]);

  const fetchQualifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('driving_licence_number, driving_licence_expiry, cpc_dqc_number, cpc_dqc_expiry, tacho_card_number, tacho_card_expiry')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setLicence({
          id_number: data.driving_licence_number || '',
          expiry_date: data.driving_licence_expiry || ''
        });
        setCpc({
          id_number: data.cpc_dqc_number || '',
          expiry_date: data.cpc_dqc_expiry || ''
        });
        setTacho({
          id_number: data.tacho_card_number || '',
          expiry_date: data.tacho_card_expiry || ''
        });
      }
    } catch (e) {
      console.error('Fetch quals error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOcrScan = async (type: 'licence' | 'cpc' | 'tacho', source: 'camera' | 'library' = 'camera') => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('permissions.cameraTitle'), t('qualifications.alerts.cameraScanRequired'));
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('permissions.mediaLibraryTitle'), t('qualifications.alerts.mediaLibraryRequired'));
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
      }

      if (result.canceled || !result.assets[0].uri) return;

      setScanning(type);
      const uri = result.assets[0].uri;
      const text = await ocrService.parseImage(uri);

      const extractedDate = ocrService.extractDate(text);
      const extractedRef = ocrService.extractReferenceNumber(text, type);

      const updateData = (prev: Qualification) => ({
        ...prev,
        expiry_date: extractedDate || prev.expiry_date,
        id_number: extractedRef || prev.id_number,
      });

      if (type === 'licence') setLicence(updateData);
      else if (type === 'cpc') setCpc(updateData);
      else if (type === 'tacho') setTacho(updateData);

      // Upload to driver_documents table as well for image storage
      try {
        const docTypeMap = {
          licence: 'HGV_Licence',
          cpc: 'CPC_Card',
          tacho: 'Tacho_Card'
        };

        const storagePath = await driverDocumentService.uploadDocumentFile(
          uri,
          'solo', // Use 'solo' as company folder for solo drivers
          userId,
          docTypeMap[type]
        );

        await driverDocumentService.addDocumentMetadata({
          user_id: userId,
          company_id: null as any, // Cast as any because service might expect string, but DB allows null
          document_type: docTypeMap[type] as any,
          storage_path: storagePath,
          id_number: extractedRef || '',
          expiry_date: extractedDate || '',
          verified_at: null
        });
      } catch (uploadError) {
        console.error('Document upload failed:', uploadError);
      }

      if (extractedDate || extractedRef) {
        Alert.alert(
          t('qualifications.alerts.scanSuccess'),
          `${extractedDate ? t('qualifications.alerts.expiryLine', { date: format(parseISO(extractedDate), 'dd/MM/yyyy') }) : ''}${extractedRef ? `\n${t('qualifications.alerts.refLine', { ref: extractedRef })}` : ''}`
        );
      } else {
        Alert.alert(t('expenses.scanResult'), t('qualifications.alerts.scanManualEntry'));
      }
    } catch (error: any) {
      console.error('OCR failed:', error);
      Alert.alert(t('common.error'), error.message || t('qualifications.alerts.scanFailed'));
    } finally {
      setScanning(null);
    }
  };

  const handleViewDocument = async (type: 'licence' | 'cpc' | 'tacho') => {
    try {
      const docTypeMap = {
        licence: 'HGV_Licence',
        cpc: 'CPC_Card',
        tacho: 'Tacho_Card'
      };

      const { data, error } = await supabase
        .from('driver_documents')
        .select('storage_path')
        .eq('user_id', userId)
        .eq('document_type', docTypeMap[type])
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Alert.alert(t('qualifications.alerts.notFoundTitle'), t('qualifications.alerts.noDocumentImage'));
        return;
      }

      const { data: urlData } = await supabase.storage
        .from('driver-documents')
        .createSignedUrl(data.storage_path, 3600);

      if (urlData?.signedUrl) {
        await Linking.openURL(urlData.signedUrl);
      }
    } catch (error) {
      console.error('View doc error:', error);
      Alert.alert(t('common.error'), t('qualifications.alerts.retrieveImageFailed'));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          driving_licence_number: licence.id_number,
          driving_licence_expiry: licence.expiry_date || null,
          cpc_dqc_number: cpc.id_number,
          cpc_dqc_expiry: cpc.expiry_date || null,
          tacho_card_number: tacho.id_number,
          tacho_card_expiry: tacho.expiry_date || null,
        })
        .eq('id', userId);

      if (error) throw error;
      Alert.alert(t('common.success'), t('qualifications.alerts.updated'));
      onClose();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const takePhoto = async (type: 'licence' | 'cpc' | 'tacho') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissions.cameraTitle'), t('qualifications.alerts.cameraScanRequired'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      uploadDocument(uri, type);
    }
  };

  const uploadDocument = async (uri: string, type: string) => {
    setSaving(true);
    try {
      const fileExt = uri.split('.').pop();
      const fileName = `${type}_${Date.now()}.${fileExt}`;
      const filePath = `${userId}/quals/${fileName}`;

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: fileName,
        type: `image/${fileExt}`,
      } as any);

      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(filePath, formData);

      if (uploadError) throw uploadError;

      Alert.alert(t('common.success'), t('qualifications.alerts.documentImageUploaded'));
    } catch (e: any) {
      Alert.alert(t('qualifications.alerts.uploadFailed'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const QualInput = ({
    title,
    icon,
    data,
    setData,
    type
  }: {
    title: string;
    icon: any;
    data: Qualification;
    setData: (d: Qualification) => void;
    type: 'licence' | 'cpc' | 'tacho';
  }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {icon}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('qualifications.numberReference')}</Text>
        <TextInput
          style={styles.input}
          value={data.id_number}
          onChangeText={(text) => setData({ ...data, id_number: text })}
          placeholder={t('qualifications.enterNumber')}
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('qualifications.expiryDate')}</Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker({ type })}
          style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
        >
          <Text style={{ color: data.expiry_date ? '#fff' : '#64748b', fontWeight: 'bold' }}>
            {data.expiry_date ? format(parseISO(data.expiry_date), 'dd/MM/yyyy') : t('vehicleManagement.selectDate')}
          </Text>
          <Calendar size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <TouchableOpacity
          style={[styles.photoBtn, { flex: 1 }]}
          onPress={() => handleOcrScan(type, 'camera')}
          disabled={scanning !== null}
        >
          {scanning === type ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Camera size={18} color="#fff" />
              <Text style={styles.photoBtnText}>{t('qualifications.scan')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.photoBtn, { width: 50, paddingHorizontal: 0 }]}
          onPress={() => handleOcrScan(type, 'library')}
          disabled={scanning !== null}
        >
          <ImageIcon size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.photoBtn, { width: 50, paddingHorizontal: 0, backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 }]}
          onPress={() => handleViewDocument(type)}
        >
          <Info size={18} color="#60a5fa" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('qualifications.professionalTitle')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ flex: 1 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <QualInput
                title={t('qualifications.docTypes.hgvLicence')}
                icon={<Award size={20} color="#3b82f6" />}
                data={licence}
                setData={setLicence}
                type="licence"
              />
              <QualInput
                title={t('qualifications.docTypes.cpcCard')}
                icon={<Shield size={20} color="#f59e0b" />}
                data={cpc}
                setData={setCpc}
                type="cpc"
              />
              <QualInput
                title={t('qualifications.docTypes.tachoCard')}
                icon={<CreditCard size={20} color="#94a3b8" />}
                data={tacho}
                setData={setTacho}
                type="tacho"
              />
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Save size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>{t('qualifications.saveChanges')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={
            (showDatePicker.type === 'licence' ? licence.expiry_date :
             showDatePicker.type === 'cpc' ? cpc.expiry_date :
             tacho.expiry_date)
            ? parseISO(showDatePicker.type === 'licence' ? licence.expiry_date :
                       showDatePicker.type === 'cpc' ? cpc.expiry_date :
                       tacho.expiry_date)
            : new Date()
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            if (event.type === 'set' && date) {
              const dateString = format(date, 'yyyy-MM-dd');
              if (showDatePicker.type === 'licence') setLicence({ ...licence, expiry_date: dateString });
              else if (showDatePicker.type === 'cpc') setCpc({ ...cpc, expiry_date: dateString });
              else if (showDatePicker.type === 'tacho') setTacho({ ...tacho, expiry_date: dateString });
            }
            setShowDatePicker(null);
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: 2 },
  scrollContent: { padding: 20 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase' },
  inputGroup: { marginBottom: 16 },
  label: { color: '#94a3b8', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
    fontWeight: 'bold',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#334155',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  photoBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#334155' },
  cancelBtnText: { color: '#94a3b8', fontWeight: 'bold' },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#2563eb', padding: 16, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
});
