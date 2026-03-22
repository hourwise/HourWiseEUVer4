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
import { X, Camera, Save, CreditCard, Shield, Award, Trash2, Calendar } from 'react-native-feather';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [licence, setLicence] = useState<Qualification>({ id_number: '', expiry_date: '' });
  const [cpc, setCpc] = useState<Qualification>({ id_number: '', expiry_date: '' });
  const [tacho, setTacho] = useState<Qualification>({ id_number: '', expiry_date: '' });

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
        setLicence({ id_number: data.driving_licence_number || '', expiry_date: data.driving_licence_expiry || '' });
        setCpc({ id_number: data.cpc_dqc_number || '', expiry_date: data.cpc_dqc_expiry || '' });
        setTacho({ id_number: data.tacho_card_number || '', expiry_date: data.tacho_card_expiry || '' });
      }
    } catch (e) {
      console.error('Fetch quals error:', e);
    } finally {
      setLoading(false);
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
      Alert.alert('Success', 'Qualifications updated successfully');
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const takePhoto = async (type: 'licence' | 'cpc' | 'tacho') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to scan documents.');
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

      Alert.alert('Success', 'Document image uploaded');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
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
        <Text style={styles.label}>Number / Reference</Text>
        <TextInput
          style={styles.input}
          value={data.id_number}
          onChangeText={(text) => setData({ ...data, id_number: text })}
          placeholder="Enter number"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={data.expiry_date}
          onChangeText={(text) => setData({ ...data, expiry_date: text })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          keyboardType="numeric"
        />
      </View>
      <TouchableOpacity style={styles.photoBtn} onPress={() => takePhoto(type)}>
        <Camera size={18} color="#fff" />
        <Text style={styles.photoBtnText}>Scan Document</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Professional Qualifications</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ flex: 1 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <QualInput
                title="HGV Driving Licence"
                icon={<Award size={20} color="#3b82f6" />}
                data={licence}
                setData={setLicence}
                type="licence"
              />
              <QualInput
                title="CPC Card (DQC)"
                icon={<Shield size={20} color="#f59e0b" />}
                data={cpc}
                setData={setCpc}
                type="cpc"
              />
              <QualInput
                title="Digital Tacho Card"
                icon={<CreditCard size={20} color="#94a3b8" />}
                data={tacho}
                setData={setTacho}
                type="tacho"
              />
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Save size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
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
  closeBtn: { p: 2 },
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
