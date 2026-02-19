import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { AlertTriangle, CheckCircle, X } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { getViolationInfo } from '../lib/compliance';

interface ShiftTotals {
  work: number;
  poa: number;
  break: number;
  driving: number;
}

interface EndShiftConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  violations: string[];
  shiftTotals: ShiftTotals;
}

const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0h 0m';
  const totalMinutes = Math.floor(Math.abs(seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

const EndShiftConfirmationModal = ({
  visible,
  onClose,
  onConfirm,
  violations,
  shiftTotals,
}: EndShiftConfirmationModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/70 p-4">
        <View className="bg-slate-800 rounded-2xl w-full max-w-sm p-6 border border-slate-700">
          <Text className="text-white text-2xl font-bold mb-4">{t('endShiftConfirmation.title')}</Text>

          <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-6">
            <Text className="text-white font-bold mb-3 text-lg border-b border-slate-700 pb-2">
              {t('endShiftConfirmation.shiftSummary')}
            </Text>
            <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalWork')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.work)}</Text></View>
            <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalDriving')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.driving)}</Text></View>
            <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalBreaks')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.break)}</Text></View>
            <View className="flex-row justify-between py-1"><Text className="text-slate-400">{t('shiftSummary.totalPOA')}</Text><Text className="text-white font-semibold">{formatTime(shiftTotals.poa)}</Text></View>
          </View>

          {violations.length > 0 ? (
            <>
              <View className="flex-row items-center bg-red-900/50 p-3 rounded-lg mb-4">
                <AlertTriangle size={24} color="#f87171" />
                <Text className="text-red-300 font-bold ml-3">{t('endShiftConfirmation.violationsFound')}</Text>
              </View>
              <ScrollView style={{ maxHeight: 150, marginBottom: 16 }}>
                {violations.map((violation, index) => {
                  const details = getViolationInfo(violation);
                  return (
                    <View key={index} className="bg-slate-700 rounded-lg p-3 mb-2">
                      <Text className="text-red-400 font-semibold">{details.title}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <View className="items-center bg-green-900/50 p-4 rounded-lg mb-6">
              <CheckCircle size={32} color="#22c55e" />
              <Text className="text-green-300 font-bold mt-2 text-lg">{t('endShiftConfirmation.greatJob')}</Text>
              <Text className="text-slate-300 text-center mt-1">{t('endShiftConfirmation.noViolations')}</Text>
            </View>
          )}

          <View className="flex-row gap-4 mt-4">
            <TouchableOpacity onPress={onClose} className="flex-1 bg-slate-600 py-3 rounded-lg">
              <Text className="text-white text-center font-bold">{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} className="flex-1 bg-compliance-danger py-3 rounded-lg">
              <Text className="text-white text-center font-bold">{t('endShiftConfirmation.confirmEnd')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default EndShiftConfirmationModal;