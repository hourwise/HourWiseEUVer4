import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  InteractionManager,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { expenseService } from '../services/expenseService';
import { ocrService } from '../services/ocrService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

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

const CATEGORIES = ['Fuel', 'Tolls', 'Parking', 'Meals', 'Accommodation', 'Supplies', 'Other'];
const CURRENCIES = ['GBP', 'EUR'];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForAppActive = () => new Promise<void>((resolve) => {
  if (AppState.currentState === 'active') {
    resolve();
    return;
  }

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      subscription.remove();
      resolve();
    }
  });
});

const waitForInteractions = () => new Promise<void>((resolve) => {
  InteractionManager.runAfterInteractions(() => resolve());
});

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

function pickBestFuelLitres(rawText: string): number | null {
  const matches = rawText.match(/\b\d{1,4}(?:[.,]\d{1,3})?\s*(?:L|LTR|LITRE|LITRES)\b/gi) ?? [];

  for (const match of matches) {
    const value = Number(normalizeAmountText(match.replace(/[^\d.,]/g, '')));
    if (Number.isFinite(value) && value > 0 && value <= 500) return value;
  }

  return null;
}

export default function AddExpenseModal({
  visible,
  onClose,
  onSaveSuccess,
  userId,
}: Props) {
  const { t } = useTranslation();
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [rawOcrText, setRawOcrText] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('GBP');
  const [merchant, setMerchant] = useState<string>('');
  const [category, setCategory] = useState<string>('Fuel');
  const [fuelLitres, setFuelLitres] = useState<string>('');
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
      setFuelLitres('');
      setNotes('');
      setBusy(false);
    }
  }, [visible]);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !busy && Number.isFinite(n) && n > 0;
  }, [amount, busy]);

  const handleImagePicked = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) {
      setBusy(false);
      return;
    }

    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setReceiptUri(uri);
    setRawOcrText('');
    setBusy(true);

    try {
      const text = await ocrService.parseImage(uri);
      setRawOcrText(text);

      const bestAmt = pickBestAmount(text);
      if (bestAmt !== null) setAmount(bestAmt.toFixed(2));

      const bestMerchant = pickBestMerchant(text);
      if (bestMerchant) setMerchant(bestMerchant);

      const bestLitres = pickBestFuelLitres(text);
      if (bestLitres !== null) setFuelLitres(bestLitres.toFixed(2));
    } catch (e: any) {
      Alert.alert(
        t('expenses.scanResult'),
        t('expenses.scanError')
      );
      console.warn('OCR Error:', e?.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const recoverPendingPickerResult = async () => {
      try {
        const pendingResults = await ImagePicker.getPendingResultAsync();
        if (cancelled || pendingResults.length === 0) return;

        const pending = pendingResults[0];
        if ('canceled' in pending) {
          await handleImagePicked(pending);
        } else if ('message' in pending) {
          console.warn('Pending image picker error:', pending.message);
        }
      } catch (error) {
        console.warn('Pending image picker recovery failed:', error);
      }
    };

    recoverPendingPickerResult();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recoverPendingPickerResult();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [visible]);

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const current = await ImagePicker.getCameraPermissionsAsync();
      let finalStatus = current.status;

      if (finalStatus !== 'granted') {
        const req = await ImagePicker.requestCameraPermissionsAsync();
        finalStatus = req.status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          t('permissions.cameraTitle'),
          t('permissions.cameraBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
          ]
        );
        setBusy(false);
        return;
      }

      await waitForAppActive();
      await waitForInteractions();
      await wait(400);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.45,
        exif: false,
      });

      await handleImagePicked(result);
    } catch (error: any) {
      console.error('Camera Launch Error:', error);
      setBusy(false);
      Alert.alert(
        t('expenses.cameraError'),
        error?.message || t('expenses.cameraErrorMessage')
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
          t('permissions.mediaLibraryTitle'),
          t('permissions.mediaLibraryBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
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
      Alert.alert(t('expenses.libraryError'), error?.message || t('expenses.libraryErrorMessage'));
    }
  };

  const handleSave = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert(t('expenses.invalidAmount'), t('expenses.invalidAmountMessage'));
      return;
    }

    setBusy(true);
    try {
      const litres = Number(fuelLitres);
      await expenseService.addExpense(
        {
          amount: n,
          currency,
          merchant: merchant.trim() || undefined,
          category: category.trim() || undefined,
          fuel_litres: category === 'Fuel' && Number.isFinite(litres) && litres > 0 ? litres : undefined,
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
      Alert.alert(t('expenses.saveFailed'), e?.message ?? t('common.failedToSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            <Text style={styles.title}>{t('expenses.title')}</Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.scanBtn, { flex: 1 }]}
                onPress={takePhoto}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.scanBtnText}>{t('common.takePhoto')}</Text>
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
                  <Text style={styles.scanBtnText}>{t('common.fromLibrary')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {receiptUri && !busy && (
              <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="contain" />
            )}

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('expenses.amount')}</Text>
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
                <Text style={styles.label}>{t('expenses.currency')}</Text>
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

            <Text style={styles.label}>{t('expenses.merchant')}</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder={t('expenses.merchantPlaceholder')}
              placeholderTextColor="#64748b"
              style={styles.input}
            />

            <Text style={styles.label}>{t('expenses.category')}</Text>
            <View style={styles.selectorGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.selectorBtn, category === c && styles.selectorBtnActive]}
                >
                  <Text style={[styles.selectorText, category === c && styles.selectorTextActive]}>
                    {t(`expenses.categories.${c}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {category === 'Fuel' ? (
              <>
                <Text style={styles.label}>{t('expenses.fuelLitres')}</Text>
                <TextInput
                  value={fuelLitres}
                  onChangeText={setFuelLitres}
                  keyboardType="numeric"
                  placeholder={t('expenses.fuelLitresPlaceholder')}
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
              </>
            ) : null}

            <Text style={styles.label}>{t('expenses.notes')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('expenses.optionalNotes')}
              placeholderTextColor="#64748b"
              style={[styles.input, { height: 80 }]}
              multiline
            />

            <View style={styles.footer}>
              <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
                <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primary, !canSave && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={!canSave}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{t('expenses.saveExpense')}</Text>
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
