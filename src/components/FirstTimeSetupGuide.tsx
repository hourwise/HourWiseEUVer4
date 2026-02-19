import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Check, Compass, Edit3, UserCheck } from 'react-native-feather';
import { useTranslation } from 'react-i18next';

interface FirstTimeSetupGuideProps {
  visible: boolean;
  onClose: () => void;
}

const Step: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <View className="flex-row items-start gap-4 mb-4">
    {icon}
    <Text className="text-slate-300 text-base flex-1">{text}</Text>
  </View>
);

function FirstTimeSetupGuide({ visible, onClose }: FirstTimeSetupGuideProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/80 p-6">
        <View className="bg-slate-800 rounded-2xl w-full p-6 border border-slate-700">
          <Text className="text-2xl font-bold text-white mb-2">{t('firstTimeSetup.title')}</Text>
          <Text className="text-slate-400 text-lg mb-6">{t('firstTimeSetup.subtitle')}</Text>

          <View>
            <Step icon={<Compass color="#38bdf8" size={24} />} text={t('firstTimeSetup.step1')} />
            <Step icon={<UserCheck color="#38bdf8" size={24} />} text={t('firstTimeSetup.step2')} />
            <Step icon={<Edit3 color="#38bdf8" size={24} />} text={t('firstTimeSetup.step3')} />
          </View>

          <TouchableOpacity
            onPress={onClose}
            className="w-full mt-6 px-6 py-3 bg-blue-600 rounded-lg flex-row justify-center items-center gap-2"
          >
            <Check color="white" size={20} />
            <Text className="text-white font-semibold text-center text-lg">
              {t('firstTimeSetup.button')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default FirstTimeSetupGuide;
