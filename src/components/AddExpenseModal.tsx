import React, { useMemo, useState } from 'react';
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

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (expense: {
    amount: number;
    currency: string;
    merchant?: string;
    dateISO?: string; // optional
    category?: string;
    notes?: string;
    receiptUri?: string;
    rawOcrText?: string;
  }) => Promise<void> | void;
};

const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';

// Use expo-constants for a more reliable way to get the API key
const OCR_SPACE_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_OCR_SPACE_API_KEY ?? '';

function normalizeAmountText(s: string) {
  return s
    .replace(/\s/g, '')
    .replace(/,/g, '.'); // turn 12,34 into 12.34 (common on receipts)
}

function extractCandidateAmounts(text: string): number[] {
  // Examples we want to catch:
  // £12.34, 12.34, 12,34, TOTAL 123.45
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

/**
 * Heuristic: prefer amounts near keywords like TOTAL/AMOUNT/DUE,
 * otherwise take the largest reasonable value.
 */
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

  // Filter out obviously non-total values (e.g. 0.01, 9999.99 etc if you want)
  const reasonable = all.filter((n) => n <= 5000); // adjust to taste
  return (reasonable.length ? Math.max(...reasonable) : Math.max(...all)) ?? null;
}

async function ocrSpaceFromUri(imageUri: string): Promise<{ text: string }> {
  if (!OCR_SPACE_API_KEY) {
    throw new Error(
      'Missing OCR.space API key. Set EXPO_PUBLIC_OCR_SPACE_API_KEY in your environment.'
    );
  }

  const form = new FormData();

  // RN/Expo multipart file object:
  const filename = `receipt_${Date.now()}.jpg`;
  form.append('file', {
    uri: imageUri,
    name: filename,
    type: 'image/jpeg',
  } as any);

  // OCR.space params
  form.append('apikey', OCR_SPACE_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('OCREngine', '2'); // often better results than 1 for receipts

  const res = await fetch(OCR_SPACE_ENDPOINT, {
    method: 'POST',
    body: form,
    headers: {
      // Let fetch set multipart boundaries automatically.
      // DO NOT set Content-Type manually.
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`OCR request failed (${res.status})`);
  }

  if (json?.IsErroredOnProcessing) {
    const msg =
      json?.ErrorMessage?.[0] ||
      json?.ErrorMessage ||
      json?.ErrorDetails ||
      'OCR.space errored while processing.';
    throw new Error(String(msg));
  }

  const parsed = json?.ParsedResults?.[0]?.ParsedText ?? '';
  return { text: parsed };
}

export default function AddExpenseModal({ visible, onClose, onSave }: Props) {
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [rawOcrText, setRawOcrText] = useState<string>('');

  const [amount, setAmount] = useState<string>(''); // keep as string for input
  const [currency, setCurrency] = useState<string>('GBP');
  const [merchant, setMerchant] = useState<string>('');
  const [category, setCategory] = useState<string>('Fuel');
  const [notes, setNotes] = useState<string>('');

  const [busy, setBusy] = useState(false);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !busy && Number.isFinite(n) && n > 0;
  }, [amount, busy]);

  const pickOrCapture = async () => {
    console.log('Starting pickOrCapture...');
    try {
      // Check current permissions
      const cameraPermissions = await ImagePicker.getCameraPermissionsAsync();
      console.log('Current camera permission status:', cameraPermissions.status);

      if (cameraPermissions.status === ImagePicker.PermissionStatus.DENIED) {
        Alert.alert(
          'Permission Required',
          'Camera access is denied. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      if (cameraPermissions.status === ImagePicker.PermissionStatus.UNDETERMINED) {
        // Ask for permission
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        console.log('Permission request result:', status);
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera permission is required to scan receipts.');
          return;
        }
      }
      
      console.log('Permissions are granted. Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.9,
        allowsEditing: false,
      });

      console.log('Camera result:', result);

      if (result.canceled) {
        console.log('User cancelled camera.');
        return;
      }

      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        console.log('No URI found in camera result.');
        return;
      }

      console.log('Image captured, URI:', uri);
      setReceiptUri(uri);
      setRawOcrText('');
      setBusy(true);

      const { text } = await ocrSpaceFromUri(uri);
      setRawOcrText(text);

      const best = pickBestAmount(text);
      if (best !== null) {
        setAmount(best.toFixed(2));
        console.log('Best amount found:', best.toFixed(2));
      } else {
        console.log('No amount found in OCR text.');
      }
    } catch (e: any) {
      console.error('Receipt OCR or camera failed:', e);
      Alert.alert('Error', e?.message ?? 'Could not scan receipt.');
    } finally {
      setBusy(false);
      console.log('pickOrCapture finished.');
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
      await onSave({
        amount: n,
        currency,
        merchant: merchant.trim() || undefined,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        receiptUri: receiptUri ?? undefined,
        rawOcrText: rawOcrText || undefined,
      });
      onClose();
      // optional: reset form here if you want
    } catch (e: any) {
      console.error('Save expense failed:', e);
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

          {receiptUri ? (
            <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="cover" />
          ) : null}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Amount</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                placeholder="0.00"
                placeholderTextColor="#64748b"
                style={styles.input}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ width: 90 }}>
              <Text style={styles.label}>Curr</Text>
              <TextInput
                value={currency}
                onChangeText={setCurrency}
                autoCapitalize="characters"
                placeholder="GBP"
                placeholderTextColor="#64748b"
                style={styles.input}
              />
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
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="Fuel / Meals / Parking..."
            placeholderTextColor="#64748b"
            style={styles.input}
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
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
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save</Text>}
            </TouchableOpacity>
          </View>

          {/* Optional: debug view */}
          {/* <Text style={{ color: '#94a3b8', fontSize: 12 }} numberOfLines={3}>{rawOcrText}</Text> */}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  scanBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  scanBtnText: { color: '#fff', fontWeight: '700' },
  preview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12, backgroundColor: '#111827' },
  label: { color: '#e2e8f0', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 8, paddingBottom: 6 },
  secondary: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#e2e8f0', fontWeight: '700' },
  primary: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
});
