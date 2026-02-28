import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle } from 'react-native-feather';

interface DigitalTachographGuideProps {
  visible: boolean;
  onClose: () => void;
}

const Section = ({ title, points }: { title: string; points: string[] }) => (
  <View className="mb-6 bg-slate-900/50 p-4 rounded-lg">
    <Text className="text-lg font-bold text-blue-400 mb-3">{title}</Text>
    {points.map((point, index) => (
      <View key={index} className="flex-row mb-2">
        <Text className="text-slate-500 mr-2 mt-1">•</Text>
        <Text className="text-slate-300 flex-1 leading-5">{point}</Text>
      </View>
    ))}
  </View>
);

export default function DigitalTachographGuide({ visible, onClose }: DigitalTachographGuideProps) {
  const { t } = useTranslation();

  const sectionsData = [
    {
      title: t('tachoGuide.prepare.title'),
      points: [t('tachoGuide.prepare.point1'), t('tachoGuide.prepare.point2'), t('tachoGuide.prepare.point3')]
    },
    {
      title: t('tachoGuide.confirmManualEntry.title'),
      points: [t('tachoGuide.confirmManualEntry.point1')]
    },
    {
      title: t('tachoGuide.enterActivities.title'),
      points: [t('tachoGuide.enterActivities.point1'), t('tachoGuide.enterActivities.point2'), t('tachoGuide.enterActivities.point3'), t('tachoGuide.enterActivities.point4')]
    },
    {
      title: t('tachoGuide.adjustTimes.title'),
      points: [t('tachoGuide.adjustTimes.point1'), t('tachoGuide.adjustTimes.point2'), t('tachoGuide.adjustTimes.point3')]
    },
    {
      title: t('tachoGuide.confirm.title'),
      points: [t('tachoGuide.confirm.point1'), t('tachoGuide.confirm.point2')]
    },
    {
      title: t('tachoGuide.finalCheck.title'),
      points: [t('tachoGuide.finalCheck.point1'), t('tachoGuide.finalCheck.point2')]
    }
  ];

  const renderWarningFooter = () => (
    <View className="bg-red-900/30 rounded-xl p-4 border border-red-700 flex-row items-start gap-2 mt-2">
      <AlertTriangle size={20} color="#f87171" className="mt-1" />
      <Text className="text-slate-200 flex-1">
        This guide is for reference only. Always follow official training and regulations.
      </Text>
    </View>
  );

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/80 p-4">
        <View className="bg-slate-800 rounded-2xl w-full h-[90%] flex overflow-hidden border border-slate-700">

          <View className="bg-slate-800 border-b border-slate-700 p-5 flex-row justify-between items-center">
            <Text className="text-xl font-bold text-white">{t('tachoGuide.title')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-lg bg-slate-700">
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={sectionsData}
            keyExtractor={(item) => item.title}
            renderItem={({ item }) => <Section title={item.title} points={item.points} />}
            contentContainerStyle={{ padding: 20 }}
            ListFooterComponent={renderWarningFooter}
          />

          <View className="bg-slate-800 border-t border-slate-700 p-5">
            <TouchableOpacity onPress={onClose} className="w-full px-6 py-3 bg-blue-600 rounded-lg">
              <Text className="text-white font-semibold text-center text-lg">{t('tachoGuide.closeButton')}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}
