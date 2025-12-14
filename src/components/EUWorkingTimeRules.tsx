import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { X, Clock, Coffee, Shield, Info } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface EUWorkingTimeRulesProps {
  visible: boolean;
  onClose: () => void;
}

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const BulletPoint = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row items-start gap-2 mb-1">
    <Text className="text-blue-400 mt-1 text-[10px]">●</Text>
    <Text className="text-slate-300 flex-1 leading-5">{children}</Text>
  </View>
);

const Section = ({ title, icon, children }: SectionProps) => (
  <View>
    <View className="flex-row items-center gap-2 mb-3">
      {icon}
      <Text className="text-lg font-bold text-white">{title}</Text>
    </View>
    <View className="bg-slate-900 p-4 rounded-lg space-y-2">
      {children}
    </View>
  </View>
);

function EUWorkingTimeRules({ visible, onClose }: EUWorkingTimeRulesProps) {
  const { t } = useTranslation();

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-center items-center bg-black/80 p-4">
        <View className="bg-slate-800 rounded-2xl w-full max-h-[90%] flex shadow-xl shadow-black">

          <View className="rounded-t-2xl border-b border-slate-700 p-5 flex-row justify-between items-center bg-slate-800">
            <Text className="text-xl font-bold text-white flex-1 mr-2">{t('euRulesTitle')}</Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 bg-slate-700 rounded-full"
              accessibilityLabel="Close rules"
              accessibilityRole="button"
            >
              <X color="white" size={20} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, space: 20 }}>
            <View className="bg-blue-900/30 rounded-xl p-4 border border-blue-500/50 flex-row gap-3">
              <Info size={24} color="#60A5FA" className="mt-1" />
              <View className="flex-1">
                <Text className="text-lg font-bold text-blue-400 mb-1">{t('euRulesAbout')}</Text>
                <Text className="text-slate-200 leading-5">{t('euRulesAboutDesc')}</Text>
              </View>
            </View>

            <Section title={t('euRulesOverview')} icon={<Shield size={20} color="#CBD5E1" />}>
              <BulletPoint>{t('euRulesOverviewPoint1')}</BulletPoint>
              <BulletPoint>{t('euRulesOverviewPoint2')}</BulletPoint>
              <BulletPoint>{t('euRulesOverviewPoint3')}</BulletPoint>
            </Section>

            <Section title={t('euRulesKeyTimeLimits')} icon={<Clock size={20} color="#CBD5E1" />}>
              <BulletPoint><Text className="font-bold text-white">{t('euRulesAvgWeekly')}</Text></BulletPoint>
              <BulletPoint><Text className="font-bold text-white">{t('euRulesMaxWeekly')}</Text></BulletPoint>
              <BulletPoint><Text className="font-bold text-white">{t('euRulesNightWork')}</Text></BulletPoint>
            </Section>

            <Section title={t('euRulesBreakRequirements')} icon={<Coffee size={20} color="#CBD5E1" />}>
              <Text className="text-slate-300 mb-2 italic">{t('euRulesBreakIntro')}</Text>
              <View className="space-y-2 pl-2 border-l-2 border-slate-700 my-2">
                <Text className="text-slate-300">{t('euRulesBreak6to9')}</Text>
                <Text className="text-slate-300">{t('euRulesBreak9Plus')}</Text>
              </View>
              <BulletPoint>{t('euRulesBreakSplit')}</BulletPoint>
              <BulletPoint>{t('euRulesBreakSeparate')}</BulletPoint>
            </Section>

            <Section title={t('euRulesInteraction')} icon={<Info size={20} color="#CBD5E1" />}>
              <BulletPoint>{t('euRulesInteractionPoint1')}</BulletPoint>
              <BulletPoint>{t('euRulesInteractionPoint2')}</BulletPoint>
            </Section>
          </ScrollView>

          <View className="rounded-b-2xl border-t border-slate-700 p-5 bg-slate-800">
            <TouchableOpacity
              onPress={onClose}
              className="w-full py-3.5 bg-blue-600 rounded-xl active:bg-blue-700"
              accessibilityRole="button"
              accessibilityLabel="Close and return"
            >
              <Text className="text-white font-bold text-center text-lg">{t('euRulesClose')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default EUWorkingTimeRules;
