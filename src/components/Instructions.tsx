import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { X, AlertTriangle, Play, Settings, BarChart2, Calendar, FilePlus, Download, UserCheck } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

interface InstructionsProps {
  onClose: () => void;
  visible: boolean;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View className="mb-6">
    <Text className="text-xl font-bold text-slate-200 mb-3 border-b border-slate-600 pb-2">{title}</Text>
    {children}
  </View>
);

const Step = ({ title, body }: { title: string; body: string }) => (
  <View className="bg-slate-700/50 p-4 rounded-lg mb-3">
    <Text className="text-lg font-semibold text-white mb-1">{title}</Text>
    <Text className="text-slate-300 leading-relaxed">{body}</Text>
  </View>
);

const Feature = ({ icon, title, body }: { icon: React.ReactNode, title: string; body: string }) => (
    <View className="bg-slate-700/50 p-4 rounded-lg mb-3 flex-row items-start gap-4">
        {icon}
        <View className="flex-1">
            <Text className="text-lg font-semibold text-white mb-1">{title}</Text>
            <Text className="text-slate-300 leading-relaxed">{body}</Text>
        </View>
    </View>
);


function Instructions({ onClose, visible }: InstructionsProps) {
  const { t } = useTranslation();

  const renderContent = () => (
    <>
      <View className="bg-amber-900/50 p-4 rounded-lg border border-amber-500 mb-6">
        <View className="flex-row items-center gap-3 mb-2">
          <AlertTriangle color="#fcd34d" size={20} />
          <Text className="text-lg font-bold text-amber-300">{t('instructions.disclaimer.title')}</Text>
        </View>
        <Text className="text-amber-100">{t('instructions.disclaimer.body')}</Text>
      </View>

      <Section title={t('instructions.initialSetup.title')}>
        <Step title={t('instructions.initialSetup.step1.title')} body={t('instructions.initialSetup.step1.body')} />
        <Step title={t('instructions.initialSetup.step2.title')} body={t('instructions.initialSetup.step2.body')} />
        <Step title={t('instructions.initialSetup.step3.title')} body={t('instructions.initialSetup.step3.body')} />
      </Section>

      <Section title={t('instructions.workflow.title')}>
        <Step title={t('instructions.workflow.step1.title')} body={t('instructions.workflow.step1.body')} />
        <Step title={t('instructions.workflow.step2.title')} body={t('instructions.workflow.step2.body')} />
        <Step title={t('instructions.workflow.step3.title')} body={t('instructions.workflow.step3.body')} />
        <Step title={t('instructions.workflow.step4.title')} body={t('instructions.workflow.step4.body')} />
      </Section>

      <Section title={t('instructions.keyFeatures.title')}>
        <Feature icon={<UserCheck color="#a5b4fc" size={24} />} title={t('instructions.keyFeatures.fatigue.title')} body={t('instructions.keyFeatures.fatigue.body')} />
        <Feature icon={<BarChart2 color="#a5b4fc" size={24} />} title={t('instructions.keyFeatures.compliance.title')} body={t('instructions.keyFeatures.compliance.body')} />
        <Feature icon={<Calendar color="#a5b4fc" size={24} />} title={t('instructions.keyFeatures.history.title')} body={t('instructions.keyFeatures.history.body')} />
        <Feature icon={<FilePlus color="#a5b4fc" size={24} />} title={t('instructions.keyFeatures.expenses.title')} body={t('instructions.keyFeatures.expenses.body')} />
        <Feature icon={<Download color="#a5b4fc" size={24} />} title={t('instructions.keyFeatures.reports.title')} body={t('instructions.keyFeatures.reports.body')} />
        <Feature icon={<AlertTriangle color="#a5b4fc" size={24} />} title={t('instructions.keyFeatures.dailyReport.title')} body={t('instructions.keyFeatures.dailyReport.body')} />
      </Section>
    </>
  );

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-slate-800" edges={['top', 'bottom']}>
        <View className="flex-1">
          {/* Header */}
          <View className="px-4 py-3 flex-row justify-between items-center border-b border-slate-700 bg-slate-800">
            <Text className="text-xl font-bold text-white">{t('instructions.title')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-full active:bg-slate-700">
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content */}
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {renderContent()}
          </ScrollView>

           {/* Footer */}
          <View className="px-4 py-3 border-t border-slate-700">
             <TouchableOpacity onPress={onClose} className="w-full py-3 bg-blue-600 rounded-lg active:bg-blue-700">
                <Text className="text-white text-lg font-semibold text-center">{t('instructions.footer.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default Instructions;
