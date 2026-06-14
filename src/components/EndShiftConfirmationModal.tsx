import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { AlertTriangle, CheckCircle, Shield, Award, AlertCircle, Truck, DollarSign } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { getViolationInfo } from '../lib/compliance';
import {
  EndShiftVehicleCheck,
  FuelExpenseOption,
  fetchEndShiftChecklistData,
  saveEndShiftChecklist,
} from '../services/endShiftChecklistService';

interface ShiftTotals {
  work: number;
  poa: number;
  break: number;
  driving: number;
}

interface EndShiftConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  violations: string[];
  shiftTotals: ShiftTotals;
  score: number;
  userId: string;
  sessionId: string | null;
  isConfirming?: boolean;
}

const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0h 0m';
  const totalMinutes = Math.floor(Math.abs(seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

const formatReceipt = (expense: FuelExpenseOption) => {
  const merchant = expense.merchant?.trim() || 'Fuel receipt';
  const amount = `${expense.currency || 'GBP'} ${Number(expense.amount).toFixed(2)}`;
  const litres = expense.fuel_litres ? ` • ${expense.fuel_litres} L` : '';
  return `${merchant} • ${amount}${litres}`;
};

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const EndShiftConfirmationModal = ({
  visible,
  onClose,
  onConfirm,
  violations,
  shiftTotals,
  score,
  userId,
  sessionId,
  isConfirming = false,
}: EndShiftConfirmationModalProps) => {
  const { t } = useTranslation();
  const totalWork = shiftTotals.work;
  const [vehicleCheck, setVehicleCheck] = useState<EndShiftVehicleCheck | null>(null);
  const [fuelExpenses, setFuelExpenses] = useState<FuelExpenseOption[]>([]);
  const [selectedFuelExpenseId, setSelectedFuelExpenseId] = useState<string | null>(null);
  const [closingOdometer, setClosingOdometer] = useState('');
  const [fuelLitres, setFuelLitres] = useState('');
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadChecklist = async () => {
      if (!visible || !userId) return;
      setIsLoadingChecklist(true);
      try {
        const data = await fetchEndShiftChecklistData(userId, sessionId);
        if (cancelled) return;

        setVehicleCheck(data.vehicleCheck);
        setFuelExpenses(data.fuelExpenses);
        setClosingOdometer(data.vehicleCheck?.closing_odometer?.toString() ?? '');

        const linkedFuel =
          data.fuelExpenses.find((expense) => expense.session_id === sessionId) ??
          (data.fuelExpenses.length === 1 ? data.fuelExpenses[0] : null);
        setSelectedFuelExpenseId(linkedFuel?.id ?? null);
        setFuelLitres(linkedFuel?.fuel_litres?.toString() ?? '');
      } catch (error) {
        console.warn('Failed to load end-shift checklist:', error);
      } finally {
        if (!cancelled) setIsLoadingChecklist(false);
      }
    };

    loadChecklist();
    return () => {
      cancelled = true;
    };
  }, [visible, userId, sessionId]);

  const selectedFuelExpense = useMemo(
    () => fuelExpenses.find((expense) => expense.id === selectedFuelExpenseId) ?? null,
    [fuelExpenses, selectedFuelExpenseId]
  );

  const getScoreColor = () => {
    if (score >= 95) return 'text-green-400';
    if (score >= 80) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = () => {
    if (score >= 95) return 'bg-green-500/10 border-green-500/20';
    if (score >= 80) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  const handleFuelSelection = (expense: FuelExpenseOption) => {
    const nextId = selectedFuelExpenseId === expense.id ? null : expense.id;
    setSelectedFuelExpenseId(nextId);
    if (nextId && expense.fuel_litres) setFuelLitres(expense.fuel_litres.toString());
  };

  const handleConfirm = async () => {
    const closing = parseOptionalNumber(closingOdometer);
    const litres = parseOptionalNumber(fuelLitres);
    const opening = vehicleCheck?.odometer_reading ?? null;

    if (Number.isNaN(closing)) {
      Alert.alert('Invalid odometer', 'Enter a valid closing odometer reading or leave it blank.');
      return;
    }

    if (Number.isNaN(litres)) {
      Alert.alert('Invalid fuel amount', 'Enter fuel added in litres as a number or leave it blank.');
      return;
    }

    if (typeof closing === 'number' && typeof opening === 'number' && closing < opening) {
      Alert.alert('Invalid odometer', 'Closing odometer cannot be lower than opening odometer.');
      return;
    }

    if (selectedFuelExpenseId && litres === null) {
      Alert.alert('Fuel litres required', 'Enter the litres added before matching the fuel receipt.');
      return;
    }

    setIsSavingChecklist(true);
    try {
      await saveEndShiftChecklist({
        sessionId,
        vehicleCheckId: vehicleCheck?.id ?? null,
        vehicleReg: vehicleCheck?.reg_number ?? null,
        openingOdometer: opening,
        closingOdometer: closing,
        selectedFuelExpenseId,
        fuelLitres: litres,
      });
      await onConfirm();
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('common.failedToSave', 'Failed to save'));
    } finally {
      setIsSavingChecklist(false);
    }
  };

  const ScoreIcon = score >= 95 ? Award : score >= 80 ? Shield : AlertCircle;
  const iconColor = score >= 95 ? '#4ade80' : score >= 80 ? '#fbbf24' : '#f87171';
  const busy = isConfirming || isSavingChecklist;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {
      if (!busy) onClose();
    }}>
      <View className="flex-1 justify-center items-center bg-black/70 p-4">
        <View className="bg-slate-800 rounded-2xl w-full max-w-md p-5 border border-slate-700" style={{ maxHeight: '92%' }}>
          <Text className="text-white text-2xl font-bold mb-4">{t('endShiftConfirmation.title')}</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className={`flex-row items-center justify-between p-4 rounded-xl border mb-4 ${getScoreBg()}`}>
              <View className="flex-row items-center gap-3">
                <ScoreIcon size={24} color={iconColor} />
                <View>
                  <Text className="text-slate-400 text-xs font-bold uppercase">{t('compliance.score', 'Compliance Score')}</Text>
                  <Text className={`text-2xl font-black ${getScoreColor()}`}>{score}%</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-slate-500 text-[10px] font-bold uppercase">{violations.length > 0 ? t('compliance.violationsFound', 'Violations') : t('compliance.perfect', 'Perfect')}</Text>
                <Text className="text-white font-bold">{violations.length}</Text>
              </View>
            </View>

            <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-4">
              <Text className="text-white font-bold mb-3 text-lg border-b border-slate-700 pb-2">
                {t('endShiftConfirmation.shiftSummary')}
              </Text>
              <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalWork')}</Text><Text className="text-white font-semibold">{formatTime(totalWork)}</Text></View>
              <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalDriving')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.driving)}</Text></View>
              <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalBreaks')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.break)}</Text></View>
              <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalPOA')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.poa)}</Text></View>
            </View>

            <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Truck size={18} color="#60a5fa" />
                <Text className="text-white font-bold text-lg">End Shift Checklist</Text>
              </View>

              {isLoadingChecklist ? (
                <ActivityIndicator color="#fff" />
              ) : vehicleCheck ? (
                <>
                  <View className="flex-row justify-between py-1">
                    <Text className="text-slate-400">Vehicle reg</Text>
                    <Text className="text-white font-semibold">{vehicleCheck.reg_number}</Text>
                  </View>
                  <View className="flex-row justify-between py-1">
                    <Text className="text-slate-400">Opening odometer</Text>
                    <Text className="text-white font-semibold">{vehicleCheck.odometer_reading ?? 'Not entered'}</Text>
                  </View>
                  <Text className="text-slate-400 text-xs font-bold uppercase mt-3 mb-2">Closing odometer</Text>
                  <TextInput
                    value={closingOdometer}
                    onChangeText={setClosingOdometer}
                    keyboardType="numeric"
                    placeholder="Enter closing reading"
                    placeholderTextColor="#64748b"
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-white mb-2"
                  />
                </>
              ) : (
                <Text className="text-amber-300 text-sm">
                  No vehicle check was found for this shift. You can still end the shift, but no odometer record will be updated.
                </Text>
              )}
            </View>

            <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <DollarSign size={18} color="#22c55e" />
                <Text className="text-white font-bold text-lg">Fuel Added</Text>
              </View>

              <Text className="text-slate-400 text-xs font-bold uppercase mb-2">Litres</Text>
              <TextInput
                value={fuelLitres}
                onChangeText={setFuelLitres}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#64748b"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-white mb-3"
              />

              <Text className="text-slate-400 text-xs font-bold uppercase mb-2">Match fuel receipt</Text>
              {fuelExpenses.length > 0 ? fuelExpenses.map((expense) => {
                const active = selectedFuelExpenseId === expense.id;
                return (
                  <TouchableOpacity
                    key={expense.id}
                    onPress={() => handleFuelSelection(expense)}
                    className={`p-3 rounded-lg border mb-2 ${active ? 'bg-blue-600/30 border-blue-400' : 'bg-slate-800 border-slate-700'}`}
                  >
                    <Text className="text-white font-semibold">{formatReceipt(expense)}</Text>
                    <Text className="text-slate-400 text-xs mt-1">{expense.date}</Text>
                  </TouchableOpacity>
                );
              }) : (
                <Text className="text-slate-400 text-sm">No fuel receipts found for today.</Text>
              )}

              {selectedFuelExpense ? (
                <Text className="text-green-300 text-xs mt-1">Selected receipt will be linked to this shift and vehicle.</Text>
              ) : null}
            </View>

            {violations.length > 0 ? (
              <>
                <View className="flex-row items-center bg-red-900/50 p-3 rounded-lg mb-4">
                  <AlertTriangle size={24} color="#f87171" />
                  <Text className="text-red-300 font-bold ml-3">{t('endShiftConfirmation.violationsFound')}</Text>
                </View>
                <View style={{ maxHeight: 150, marginBottom: 16 }}>
                  {violations.map((violation, index) => {
                    const details = getViolationInfo(violation);
                    return (
                      <View key={index} className="bg-slate-700 rounded-lg p-3 mb-2">
                        <Text className="text-red-400 font-semibold">{details.title}</Text>
                        <Text className="text-slate-300 text-xs mt-1">{details.tip}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <View className="items-center bg-green-900/50 p-4 rounded-lg mb-4">
                <CheckCircle size={32} color="#22c55e" />
                <Text className="text-green-300 font-bold mt-2 text-lg">{t('endShiftConfirmation.greatJob')}</Text>
                <Text className="text-slate-300 text-center mt-1">{t('endShiftConfirmation.noViolations')}</Text>
              </View>
            )}
          </ScrollView>

          <View className="flex-row gap-4 mt-4">
            <TouchableOpacity disabled={busy} onPress={onClose} className={`flex-1 bg-slate-600 py-3 rounded-lg ${busy ? 'opacity-50' : ''}`}>
              <Text className="text-white text-center font-bold">{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={handleConfirm} className={`flex-1 bg-compliance-danger py-3 rounded-lg flex-row items-center justify-center ${busy ? 'opacity-70' : ''}`}>
              {busy ? <ActivityIndicator color="white" style={{ marginRight: 8 }} /> : null}
              <Text className="text-white text-center font-bold">
                {busy ? t('common.loading', 'Saving...') : t('endShiftConfirmation.confirmEnd')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default EndShiftConfirmationModal;
