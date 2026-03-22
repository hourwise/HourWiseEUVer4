import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { expenseService } from '../services/expenseService';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const CATEGORIES = ['Fuel', 'Tolls', 'Parking', 'Meals', 'Accommodation', 'Supplies', 'Other'];
const CURRENCIES = ['GBP', 'EUR'];

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

function pickBestMerchant(rawText: string): string | null {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const merchantKeywords = [
    'LTD',
    'LIMITED',
    'STATION',
    'SERVICES',
    'STORE',
    'SHOP',
    'RETAIL',
    'CAFE',
    'REST',
    'BP',
    'SHELL',
    'ESSO',
    'TEXACO',
    'ASDA',
    'TESCO',
    'SAINSBURY',
  ];

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (merchantKeywords.some((k) => line.toUpperCase().includes(k))) {
      return line;
    }
  }

  const firstGoodLine = lines.find((l) => !/^\d/.test(l) && l.length > 3);
  return firstGoodLine || lines[0] || null;
}

function pickBestAmount(rawText: string): number | null {
  const lines = rawText.split('\n');

  const keywordLines = lines.filter((l) =>
    /(TOTAL|AMOUNT\s+DUE|BALANCE|GRAND\s+TOTAL|TO\s+PAY|PAYMENT|SUM|DUE)/i.test(l)
  );

  for (const line of keywordLines) {
    const candidates = extractCandidateAmounts(line);
    if (candidates.length) return Math.max(...candidates);
  }

  const all = extractCandidateAmounts(rawText);
  if (!all.length) return null;

  const reasonable = all.filter((n) => n <= 2000);
  return (reasonable.length ? Math.max(...reasonable) : Math.max(...all)) ?? null;
}

async function ocrSpaceFromUri(imageUri: string): Promise<{ text: string }> {
  if (!OCR_SPACE_API_KEY) throw new Error('Missing OCR.space API key.');

  const form = new FormData();
  const filename = `receipt_${Date.now()}.jpg`;

  form.append('file', {
    uri: imageUri,
    name: filename,
    type: 'image/jpeg',
  } as any);

  form.append('apikey', OCR_SPACE_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('OCREngine', '2');

  const res = await fetch(OCR_SPACE_ENDPOINT, {
    method: 'POST',
    body: form,
  });

  const json = await res.json();

  if (!res.ok) throw new Error(`OCR request failed (${res.status})`);

  if (json?.IsErroredOnProcessing) {
    const msg = json?.ErrorMessage?.[0] || 'OCR processing failed.';
    throw new Error(String(msg));
  }

  return { text: json?.ParsedResults?.[0]?.ParsedText ?? '' };
}

export default function AddExpenseModal({
  visible,
  onClose,
  onSaveSuccess,
  userId,
}: Props) {
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

      const bestAmt = pickBestAmount(text);
      if (bestAmt !== null) setAmount(bestAmt.toFixed(2));

      const bestMerchant = pickBestMerchant(text);
      if (bestMerchant) setMerchant(bestMerchant);
    } catch (e: any) {
      Alert.alert(
        'Scan Result',
        'Image uploaded, but could not automatically read details. You can still fill the form manually.'
      );
      console.warn('OCR Error:', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    try {
      const current = await ImagePicker.getCameraPermissionsAsync();
      let finalStatus = current.status;

      if (finalStatus !== 'granted') {
        const req = await ImagePicker.requestCameraPermissionsAsync();
        finalStatus = req.status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera access is needed. Please enable it in settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
        cameraType: ImagePicker.CameraType.back,
        exif: false,
      });

      await handleImagePicked(result);
    } catch (error: any) {
      console.error('Camera Launch Error:', error);
      Alert.alert(
        'Camera Error',
        error?.message || 'Could not open the camera. Please try selecting from your library instead.'
      );
    }
  };

  const chooseFromLibrary = async () => {
    try {
      const current = await ImagePicker.getMediaLibraryPermissionsAsync();
      let finalStatus = current.status;

      if (finalStatus !== 'granted') {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        finalStatus = req.status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Gallery access is needed. Please enable it in settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        exif: false,
      });

      await handleImagePicked(result);
    } catch (error: any) {
      console.error('Library Launch Error:', error);
      Alert.alert('Library Error', error?.message || 'Could not open the photo library.');
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
          image_url: receiptUri ?? undefined,
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
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            <Text style={styles.title}>Add Expense</Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.scanBtn, { flex: 1 }]}
                onPress={takePhoto}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.scanBtnText}>Take Photo</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scanBtn, styles.libraryBtn, { flex: 1 }]}
                onPress={chooseFromLibrary}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.scanBtnText}>From Library</Text>
                )}
              </TouchableOpacity>
            </View>

            {receiptUri && !busy && (
              <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="contain" />
            )}

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
              </View>

              <View style={{ width: 12 }} />

              <View style={{ width: 110 }}>
                <Text style={styles.label}>Currency</Text>
                <View style={styles.selectorRow}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCurrency(c)}
                      style={[styles.selectorBtn, currency === c && styles.selectorBtnActive]}
                    >
                      <Text
                        style={[styles.selectorText, currency === c && styles.selectorTextActive]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.label}>Merchant</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Shell"
              placeholderTextColor="#64748b"
              style={styles.input}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.selectorGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.selectorBtn, category === c && styles.selectorBtnActive]}
                >
                  <Text style={[styles.selectorText, category === c && styles.selectorTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes..."
              placeholderTextColor="#64748b"
              style={[styles.input, { height: 80 }]}
              multiline
            />

            <View style={styles.footer}>
              <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primary, !canSave && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={!canSave}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Save Expense</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '95%',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  scanBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  libraryBtn: {
    backgroundColor: '#334155',
  },
  scanBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#1e293b',
  },
  label: {
    color: '#94a3b8',
    marginBottom: 8,
    fontWeight: 'bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    marginBottom: 16,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  secondary: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#e2e8f0',
    fontWeight: 'bold',
  },
  primary: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 4,
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  selectorBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectorBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#60a5fa',
  },
  selectorText: {
    color: '#94a3b8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  selectorTextActive: {
    color: '#fff',
  },
});