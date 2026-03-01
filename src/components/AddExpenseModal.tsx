import React, { useMemo, useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, Image, StyleSheet, Linking, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { expenseService } from '../services/expenseService';

const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

type Props = { visible: boolean; onClose: () => void; onSaveSuccess: () => void; userId: string; };

const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_SPACE_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_OCR_SPACE_API_KEY ?? '';

const CATEGORIES = ['Fuel', 'Tolls', 'Parking', 'Meals', 'Accommodation', 'Supplies', 'Other'];
const CURRENCIES = ['GBP', 'EUR'];

// --- OCR HELPER FUNCTIONS (UNCHANGED) ---
function normalizeAmountText(s: string) { return s.replace(/\s/g, '').replace(/,/g, '.'); }
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
  const keywordLines = upper.split('\n').filter((l) => /(TOTAL|AMOUNT\s+DUE|BALANCE|GRAND\s+TOTAL|TO\s+PAY)/.test(l));
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
  if (!OCR_SPACE_API_KEY) throw new Error('Missing OCR.space API key.');
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
  if (json?.IsErroredOnProcessing) { const msg = json?.ErrorMessage?.[0] || 'OCR.space errored while processing.'; throw new Error(String(msg)); }
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
      setReceiptUri(null); setRawOcrText(''); setAmount(''); setCurrency('GBP'); setMerchant(''); setCategory('Fuel'); setNotes(''); setBusy(false);
    }
  }, [visible]);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !busy && Number.isFinite(n) && n > 0;
  }, [amount, busy]);

  const handleImagePicked = async (result: ImagePicker.ImagePickerResult) => {
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
      Alert.alert('Scan Error', e?.message ?? 'Could not read receipt text.');
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to scan receipts. Please enable it in your device settings.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      await handleImagePicked(result);
    } catch (error) {
      console.error("Failed to launch camera:", error);
      Alert.alert("Camera Error", "Could not open the camera. This can happen on virtual devices without a configured camera. Please try choosing an image from your library instead.");
    }
  };

  const chooseFromLibrary = async () => {
    try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Media library access is needed to choose receipts. Please enable it in your device settings.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
          );
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
        await handleImagePicked(result);
    } catch (error) {
        console.error("Failed to open image library:", error);
        Alert.alert("Library Error", "Could not open the photo library.");
    }
  };

  const presentImagePicker = () => {
    Alert.alert("Add Receipt", "How would you like to add the receipt?",
      [
        { text: "Take Photo", onPress: takePhoto },
        { text: "Choose from Library", onPress: chooseFromLibrary },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleSave = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      await expenseService.addExpense({
          amount: n, currency, merchant: merchant.trim() || undefined, category: category.trim() || undefined,
          notes: notes.trim() || undefined, image_url: receiptUri ?? undefined, raw_ocr_text: rawOcrText || undefined, date: toLocalDateString(new Date()),
        }, userId );
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
          <ScrollView>
            <Text style={styles.title}>Add Expense</Text>

            <TouchableOpacity style={styles.scanBtn} onPress={presentImagePicker} disabled={busy}>
              {busy && receiptUri ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanBtnText}>Scan Receipt</Text>}
            </TouchableOpacity>

            {receiptUri && <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="cover" />}

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Amount</Text>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#64748b" style={styles.input} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ width: 110 }}>
                <Text style={styles.label}>Currency</Text>
                <View style={styles.selectorRow}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity key={c} onPress={() => setCurrency(c)} style={[styles.selectorBtn, currency === c && styles.selectorBtnActive]}>
                      <Text style={[styles.selectorText, currency === c && styles.selectorTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.label}>Merchant</Text>
            <TextInput value={merchant} onChangeText={setMerchant} placeholder="e.g. Shell" placeholderTextColor="#64748b" style={styles.input} />

            <Text style={styles.label}>Category</Text>
            <View style={styles.selectorGrid}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.selectorBtn, category === c && styles.selectorBtnActive]}>
                  <Text style={[styles.selectorText, category === c && styles.selectorTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0f172a', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '90%' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  scanBtn: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 12, minHeight: 44 },
  scanBtnText: { color: '#fff', fontWeight: '700' },
  preview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12, backgroundColor: '#111827' },
  label: { color: '#e2e8f0', marginBottom: 6, fontWeight: '600', fontSize: 14 },
  input: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 16, paddingBottom: 6 },
  secondary: { flex: 1, backgroundColor: '#1e293b', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  secondaryText: { color: '#e2e8f0', fontWeight: '700' },
  primary: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  selectorRow: { flexDirection: 'row', backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  selectorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  selectorBtn: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  selectorBtnActive: { backgroundColor: '#475569', borderColor: '#60a5fa' },
  selectorText: { color: '#cbd5e1', fontWeight: '600', textAlign: 'center' },
  selectorTextActive: { color: '#fff' },
});
