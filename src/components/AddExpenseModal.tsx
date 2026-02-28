import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  StyleSheet,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { expenseService } from '../services/expenseService';

// Helper to get YYYY-MM-DD from a local date, ignoring timezone shifts
const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  userId: string;
};

const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_SPACE_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_OCR_SPACE_API_KEY ?? '';

function normalizeAmountText(s: string) {
  return s.replace(/\s/g, '').replace(/,/g, '.');
}

function extractCandidateAmounts(text: string): number[] {
  const normalized = text.replace(/\u00A0/g, ' ');
  const matches = normalized.match(/(?:£|€|\$)?\s*\d{1,4}(?:[.,]\d{2})/g) ?? [];
  const nums: number[] = [];
  for (const m of matches) {
    const cleaned = normalizeAmountText(m.replace(/[^\d.,]/g, ''));
    const val = Number(cleaned);
    if (!Number.isNaN(val) && val > 0) nums.push(val);
  }
  return nums;
}

function pickBestAmount(rawText: string): number | null {
  const upper = rawText.toUpperCase();
  const keywordLines = upper
    .split('\n')
    .filter((l) => /(TOTAL|AMOUNT\s+DUE|BALANCE|GRAND\s+TOTAL|TO\s+PAY)/.test(l));
  for (const line of keywordLines) {
    const candidates = extractCandidateAmounts(line);
    if (candidates.length) return Math.max(...candidates);
  }
  const all = extractCandidateAmounts(rawText);
  if (!all.length) return null;
  const reasonable = all.filter((n) => n <= 5000);
  return (reasonable.length ? Math.max(...reasonable) : Math.max(...all)) ?? null;
}

async function ocrSpaceFromUri(imageUri: string): Promise<{ text: string }> {
  if (!OCR_SPACE_API_KEY) {
    throw new Error('Missing OCR.space API key.');
  }
  const form = new FormData();
  const filename = `receipt_${Date.now()}.jpg`;
  form.append('file', { uri: imageUri, name: filename, type: 'image/jpeg' } as any);
  form.append('apikey', OCR_SPACE_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('OCREngine', '2');
  const res = await fetch(OCR_SPACE_ENDPOINT, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(`OCR request failed (${res.status})`);
  if (json?.IsErroredOnProcessing) {
    const msg = json?.ErrorMessage?.[0] || 'OCR.space errored while processing.';
    throw new Error(String(msg));
  }
  return { text: json?.ParsedResults?.[0]?.ParsedText ?? '' };
}

export default function AddExpenseModal({ visible, onClose, onSaveSuccess, userId }: Props) {
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [rawOcrText, setRawOcrText] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('GBP');
  const [merchant, setMerchant] = useState<string>('');
  const [category, setCategory] = useState<string>('Fuel');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setReceiptUri(null);
      setRawOcrText('');
      setAmount('');
      setCurrency('GBP');
      setMerchant('');
      setCategory('Fuel');
      setNotes('');
      setBusy(false);
    }
  }, [visible]);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !busy && Number.isFinite(n) && n > 0;
  }, [amount, busy]);

  const pickOrCapture = async () => {
    const cameraPermissions = await ImagePicker.getCameraPermissionsAsync();
    if (cameraPermissions.status === ImagePicker.PermissionStatus.DENIED) {
      Alert.alert('Permission Required', 'Camera access is denied.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    if (cameraPermissions.status === ImagePicker.PermissionStatus.UNDETERMINED) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required.');
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setReceiptUri(uri);
    setRawOcrText('');
    setBusy(true);
    try {
      const { text } = await ocrSpaceFromUri(uri);
      setRawOcrText(text);
      const best = pickBestAmount(text);
      if (best !== null) setAmount(best.toFixed(2));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not scan receipt.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      await expenseService.addExpense(
        {
          amount: n,
          currency,
          merchant: merchant.trim() || undefined,
          category: category.trim() || undefined,
          notes: notes.trim() || undefined,
          receipt_url: receiptUri ?? undefined,
          raw_ocr_text: rawOcrText || undefined,
          date: toLocalDateString(new Date()),
        },
        userId
      );
      onSaveSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not save expense.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Add Expense</Text>

          <TouchableOpacity style={styles.scanBtn} onPress={pickOrCapture} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanBtnText}>Scan Receipt</Text>}
          </TouchableOpacity>

          {receiptUri ? <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="cover" /> : null}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Amount</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'} placeholder="0.00" placeholderTextColor="#64748b" style={styles.input} />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ width: 90 }}>
              <Text style={styles.label}>Curr</Text>
              <TextInput value={currency} onChangeText={setCurrency} autoCapitalize="characters" placeholder="GBP" placeholderTextColor="#64748b" style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>Merchant</Text>
          <TextInput value={merchant} onChangeText={setMerchant} placeholder="e.g. Shell" placeholderTextColor="#64748b" style={styles.input} />

          <Text style={styles.label}>Category</Text>
          <TextInput value={category} onChangeText={setCategory} placeholder="Fuel / Meals / Parking..." placeholderTextColor="#64748b" style={styles.input} />

          <Text style={styles.label}>Notes</Text>
          <TextInput value={notes} onChangeText={setNotes} placeholder="Optional" placeholderTextColor="#64748b" style={[styles.input, { height: 80 }]} multiline />

          <View style={styles.footer}>
            <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primary, !canSave && { opacity: 0.5 }]} onPress={handleSave} disabled={!canSave}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0f172a', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  scanBtn: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  scanBtnText: { color: '#fff', fontWeight: '700' },
  preview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12, backgroundColor: '#111827' },
  label: { color: '#e2e8f0', marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 8, paddingBottom: 6 },
  secondary: { flex: 1, backgroundColor: '#1e293b', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  secondaryText: { color: '#e2e8f0', fontWeight: '700' },
  primary: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
});
