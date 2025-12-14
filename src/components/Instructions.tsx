import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { X, Clock, Play, AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface InstructionsProps {
  onClose: () => void;
  visible: boolean;
}

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <View className="flex-row items-center gap-2 mb-4">
    {icon}
    <Text className="text-xl font-bold text-white">{title}</Text>
  </View>
);

const StepCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View className="bg-slate-900 p-4 rounded-lg mb-4">
    <Text className="text-lg font-semibold text-white mb-2">{title}</Text>
    {children}
  </View>
);

function Instructions({ onClose, visible }: InstructionsProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/75 p-4">
        <View className="bg-slate-800 rounded-2xl w-full flex-1 max-h-[90%] overflow-hidden">

          {/* Header */}
          <View className="border-b border-slate-700 p-6 flex-row justify-between items-center bg-slate-800">
            <Text className="text-2xl font-bold text-white">{t('instructionsTitle')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-lg active:bg-slate-700">
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content */}
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>

            {/* Disclaimer */}
            <View className="bg-amber-900/40 rounded-xl p-4 border border-amber-600 mb-8">
              <View className="flex-row items-center gap-2 mb-3">
                <AlertCircle size={20} color="#facc15" />
                <Text className="text-xl font-bold text-amber-400">{t('instructionsDisclaimerTitle')}</Text>
              </View>
              <Text className="text-slate-200">{t('instructionsDisclaimer')}</Text>
            </View>

            {/* Getting Started */}
            <View className="mb-8">
              <SectionHeader icon={<Clock size={20} color="white" />} title={t('instructionsGettingStartedTitle')} />
              <View className="bg-blue-900/30 p-4 rounded-lg border border-blue-500/50 mb-2">
                <Text className="text-blue-200 font-semibold">{t('instructionsGettingStartedDesc')}</Text>
              </View>
            </View>

            {/* Step-by-Step Guide */}
            <View className="mb-8">
              <SectionHeader icon={<Play size={20} color="white" />} title={t('instructionsStepGuideTitle')} />

              <StepCard title={t('instructionsStep1Title')}>
                <Text className="text-slate-300">{t('instructionsStep1Desc')}</Text>
              </StepCard>

              <StepCard title={t('instructionsStep2Title')}>
                <Text className="text-slate-300 mb-2">{t('instructionsStep2Desc')}</Text>
                <View className="space-y-2 ml-4">
                  <View>
                    <Text className="text-blue-400 font-semibold">{t('instructionsBreak15Title')}</Text>
                    <Text className="text-slate-400 ml-4">{t('instructionsBreak15Desc')}</Text>
                  </View>
                  <View>
                    <Text className="text-blue-400 font-semibold">{t('instructionsBreak30Title')}</Text>
                    <Text className="text-slate-400 ml-4">{t('instructionsBreak30Desc')}</Text>
                  </View>
                  <View>
                    <Text className="text-blue-400 font-semibold">{t('instructionsBreak45Title')}</Text>
                    <Text className="text-slate-400 ml-4">{t('instructionsBreak45Desc')}</Text>
                  </View>
                </View>
              </StepCard>

              <StepCard title={t('instructionsStep3Title')}>
                <Text className="text-slate-300">{t('instructionsStep3Desc')}</Text>
              </StepCard>
            </View>

            {/* Safety Warning */}
            <View className="bg-red-900/30 rounded-xl p-4 border border-red-700 mb-4">
              <Text className="text-xl font-bold text-red-400 mb-3">{t('instructionsSafetyWarningTitle')}</Text>
              <Text className="text-slate-200">{t('instructionsSafetyWarningDesc')}</Text>
            </View>

          </ScrollView>

          {/* Footer */}
          <View className="border-t border-slate-700 p-6 bg-slate-800">
            <TouchableOpacity onPress={onClose} className="w-full px-6 py-3 bg-blue-600 rounded-lg active:bg-blue-700">
              <Text className="text-white font-semibold text-center">{t('instructionsButtonGotIt')}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

export default Instructions;
