import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList } from 'react-native';
import { X, AlertTriangle } from 'lucide-react-native';

interface DigitalTachographGuideProps {
  visible: boolean;
  onClose: () => void;
  t: (key: string) => string;
}

// Helper component to render list items
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

export default function DigitalTachographGuide({ visible, onClose, t }: DigitalTachographGuideProps) {

  // Define the content using the CORRECT translation keys from your JSON
  const sectionsData = [
    {
      title: t('digitalTachographGuide.prepare.title'),
      points: [
        t('digitalTachographGuide.prepare.point1'),
        t('digitalTachographGuide.prepare.point2'),
        t('digitalTachographGuide.prepare.point3'),
      ]
    },
    {
      title: t('digitalTachographGuide.confirmManualEntry.title'),
      points: [
        t('digitalTachographGuide.confirmManualEntry.point1')
      ]
    },
    {
      title: t('digitalTachographGuide.enterActivities.title'),
      points: [
        t('digitalTachographGuide.enterActivities.point1'),
        t('digitalTachographGuide.enterActivities.point2'),
        t('digitalTachographGuide.enterActivities.point3'),
        t('digitalTachographGuide.enterActivities.point4'),
      ]
    },
    {
      title: t('digitalTachographGuide.adjustTimes.title'),
      points: [
        t('digitalTachographGuide.adjustTimes.point1'),
        t('digitalTachographGuide.adjustTimes.point2'),
        t('digitalTachographGuide.adjustTimes.point3'),
      ]
    },
    {
      title: t('digitalTachographGuide.confirm.title'),
      points: [
        t('digitalTachographGuide.confirm.point1'),
        t('digitalTachographGuide.confirm.point2'),
      ]
    },
    {
      title: t('digitalTachographGuide.finalCheck.title'),
      points: [
        t('digitalTachographGuide.finalCheck.point1'),
        t('digitalTachographGuide.finalCheck.point2'),
      ]
    }
  ];

  const renderWarningFooter = () => (
    <View className="bg-red-900/30 rounded-xl p-4 border border-red-700 flex-row items-start gap-2 mt-2">
      <AlertTriangle size={20} color="#f87171" className="mt-1" />
      <Text className="text-slate-200 flex-1">
        <Text className="font-bold">{t('digitalTachographGuide.warning.title')}</Text> {t('digitalTachographGuide.warning.text')}
      </Text>
    </View>
  );

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/80 p-4">
        <View className="bg-slate-800 rounded-2xl w-full h-[90%] flex overflow-hidden border border-slate-700">

          {/* Header */}
          <View className="bg-slate-800 border-b border-slate-700 p-5 flex-row justify-between items-center">
            <Text className="text-xl font-bold text-white">{t('digitalTachographGuide.title')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-lg bg-slate-700">
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <FlatList
            data={sectionsData}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => <Section title={item.title} points={item.points} />}
            contentContainerStyle={{ padding: 20 }}
            ListFooterComponent={renderWarningFooter}
          />

          {/* Footer Button */}
          <View className="bg-slate-800 border-t border-slate-700 p-5">
            <TouchableOpacity onPress={onClose} className="w-full px-6 py-3 bg-blue-600 rounded-lg">
              <Text className="text-white font-semibold text-center text-lg">{t('digitalTachographGuide.closeButton')}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}
