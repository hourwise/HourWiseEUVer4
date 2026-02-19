import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { CheckCircle, AlertTriangle, X } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { getViolationInfo } from '../lib/compliance';

interface DailyComplianceReportModalProps {
  visible: boolean;
  onClose: () => void;
  violations: string[];
  date: string;
}

const DailyComplianceReportModal = ({
  visible,
  onClose,
  violations,
  date,
}: DailyComplianceReportModalProps) => {
  const { t } = useTranslation();

  const formattedDate = new Date(date).toLocaleDateString(t('locale'), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/70 p-4">
        <View className="bg-slate-800 rounded-2xl w-full max-w-sm p-6 border border-slate-700">
          <TouchableOpacity onPress={onClose} className="absolute top-4 right-4">
            <X size={24} color="#94a3b8" />
          </TouchableOpacity>

          <Text className="text-white text-2xl font-bold mb-2">{t('dailyReport.title')}</Text>
          <Text className="text-slate-400 text-sm mb-6">{formattedDate}</Text>

          {violations.length > 0 ? (
            <>
              <View className="flex-row items-center bg-red-900/50 p-3 rounded-lg mb-4">
                <AlertTriangle size={24} color="#f87171" />
                <Text className="text-red-300 font-bold ml-3">{t('dailyReport.violationsFound')}</Text>
              </View>
              <ScrollView style={{ maxHeight: 200 }}>
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
            <View className="items-center bg-green-900/50 p-4 rounded-lg">
              <CheckCircle size={32} color="#22c55e" />
              <Text className="text-green-300 font-bold mt-2 text-lg">{t('dailyReport.greatJob')}</Text>
              <Text className="text-slate-300 text-center mt-1">{t('dailyReport.noViolations')}</Text>
            </View>
          )}

          <TouchableOpacity onPress={onClose} className="mt-6 bg-blue-600 py-3 rounded-lg">
            <Text className="text-white text-center font-bold">{t('common.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default DailyComplianceReportModal;