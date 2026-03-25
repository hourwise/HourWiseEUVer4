import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { AlertTriangle, CheckCircle, Shield, Award, AlertCircle } from 'react-native-feather';
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
  score: number;
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
  score,
}: EndShiftConfirmationModalProps) => {
  const { t } = useTranslation();

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

  const ScoreIcon = score >= 95 ? Award : score >= 80 ? Shield : AlertCircle;
  const iconColor = score >= 95 ? '#4ade80' : score >= 80 ? '#fbbf24' : '#f87171';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/70 p-4">
        <View className="bg-slate-800 rounded-2xl w-full max-w-sm p-6 border border-slate-700">
          <Text className="text-white text-2xl font-bold mb-4">{t('endShiftConfirmation.title')}</Text>

          <View className={`flex-row items-center justify-between p-4 rounded-xl border mb-6 ${getScoreBg()}`}>
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
                      <Text className="text-slate-300 text-xs mt-1">{details.tip}</Text>
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
