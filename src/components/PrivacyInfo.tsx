import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Linking } from 'react-native';
import { X, Shield, Info, Database, Lock, UserCheck, Share2, AlertTriangle, ChevronRight } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

interface PrivacyInfoProps {
  visible: boolean;
  onClose: () => void;
}

const Section = ({ icon, title, body, children }: { icon: React.ReactNode; title: string; body?: string; children?: React.ReactNode }) => (
  <View className="mb-5">
    <View className="flex-row items-center gap-3 mb-2">
      {icon}
      <Text className="text-xl font-bold text-slate-200">{title}</Text>
    </View>
    {body && <Text className="text-slate-300 leading-relaxed ml-10">{body}</Text>}
    {children && <View className="ml-10 mt-2">{children}</View>}
  </View>
);

function PrivacyInfo({ visible, onClose }: PrivacyInfoProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dataPoints = t('privacyDataPoints', { returnObjects: true, defaultValue: [] }) as string[];

  const handleManageData = () => {
    onClose();
    navigation.navigate('AccountManagement');
  };

  const renderContent = () => (
    <>
      <View className="bg-slate-700/50 p-4 rounded-lg mb-6">
        <Text className="text-2xl font-bold text-center text-white mb-2">{t('privacySubtitle')}</Text>
        <Text className="text-slate-300 text-center leading-relaxed">{t('privacyIntro')}</Text>
      </View>

      <Section icon={<Info color="#a5b4fc" size={24}/>} title={t('privacyWhyTitle')} body={t('privacyWhyDesc')} />
      <Section icon={<Database color="#a5b4fc" size={24}/>} title={t('privacyDataCollectedTitle')} body={t('privacyDataCollectedDesc')}>
        <View className="space-y-2 mt-3">
          {dataPoints.map((point, index) => (
            <View key={index} className="flex-row items-start gap-2">
              <Text className="text-indigo-300 font-bold mt-1">▪</Text>
              <Text className="text-slate-300 flex-1">{point}</Text>
            </View>
          ))}
        </View>
      </Section>
      <Section icon={<Lock color="#a5b4fc" size={24}/>} title={t('privacyStorageTitle')} body={t('privacyStorageDesc')} />
      <Section icon={<UserCheck color="#a5b4fc" size={24}/>} title={t('privacyControlTitle')} body={t('privacyControlDesc')} />
      <Section icon={<Share2 color="#a5b4fc" size={24}/>} title={t('privacyThirdPartyTitle')} body={t('privacyThirdPartyDesc')} />

      <Section icon={<UserCheck color="#a5b4fc" size={24}/>} title={t('privacy.gdprRightsTitle', 'Your GDPR Rights')}>
        <Text className="text-slate-300 leading-relaxed">
            {t('privacy.gdprRightsDesc', 'Under GDPR, you have the right to access, rectify, or erase your personal data. You can manage these rights directly in the app or submit a formal request via our online portal.')}
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.hourwiseeu.co.uk/privacy-request')}>
            <Text className="text-blue-400 underline mt-2">www.hourwiseeu.co.uk/privacy-request</Text>
        </TouchableOpacity>
      </Section>

      <View className="bg-amber-900/50 p-4 rounded-lg border border-amber-500 mt-4">
        <View className="flex-row items-center gap-3 mb-2">
          <AlertTriangle color="#fcd34d" size={20} />
          <Text className="text-lg font-bold text-amber-300">{t('privacyDisclaimerTitle')}</Text>
        </View>
        <Text className="text-amber-100">{t('privacyDisclaimer')}</Text>
      </View>

      <TouchableOpacity onPress={handleManageData} className="w-full mt-6 py-3 bg-slate-700 rounded-lg active:bg-slate-600 flex-row justify-between items-center px-4">
        <Text className="text-white text-lg font-semibold">{t('account.manageMyData', 'Manage My Data')}</Text>
        <ChevronRight color="white" size={24} />
      </TouchableOpacity>
    </>
  );

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-slate-800" edges={['top', 'bottom']}>
        <View className="flex-1">
          <View className="px-4 py-3 flex-row justify-between items-center border-b border-slate-700 bg-slate-800">
            <View className="flex-row items-center gap-2">
              <Shield color="white" size={20}/>
              <Text className="text-xl font-bold text-white">{t('privacyTitle')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-full active:bg-slate-700">
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>{renderContent()}</ScrollView>
          <View className="px-4 py-3 border-t border-slate-700">
             <TouchableOpacity onPress={onClose} className="w-full py-3 bg-blue-600 rounded-lg active:bg-blue-700">
                <Text className="text-white text-lg font-semibold text-center">{t('common.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default PrivacyInfo;
