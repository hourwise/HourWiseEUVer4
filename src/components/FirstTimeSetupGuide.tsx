import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Check, Compass, Edit3, UserCheck } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Define the type for the navigation stack parameters
type SetupStackParamList = {
  FirstTimeSetup: undefined;
  DriverSetup: undefined; // Add other screens in the stack if any
};

// Define the navigation prop type for this screen
type FirstTimeSetupNavigationProp = NativeStackNavigationProp<SetupStackParamList, 'FirstTimeSetup'>;


const Step: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
    {icon}
    <Text style={{ color: '#CBD5E1', fontSize: 16, flex: 1 }}>{text}</Text>
  </View>
);

function FirstTimeSetupGuide() {
  const { t } = useTranslation();
  const navigation = useNavigation<FirstTimeSetupNavigationProp>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#1E293B', borderRadius: 16, width: '100%', padding: 24, borderWidth: 1, borderColor: '#334155' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 8 }}>{t('firstTimeSetup.title', "Let's Get You Set Up")}</Text>
          <Text style={{ color: '#94A3B8', fontSize: 18, marginBottom: 24 }}>{t('firstTimeSetup.subtitle', "Just a few steps to personalize your experience.")}</Text>

          <View>
            <Step icon={<Compass color="#38bdf8" size={24} />} text={t('firstTimeSetup.step1', "First, we'll need some permissions to track your work accurately.")} />
            <Step icon={<UserCheck color="#38bdf8" size={24} />} text={t('firstTimeSetup.step2', "Next, you'll set up your driver profile and pay details.")} />
            <Step icon={<Edit3 color="#38bdf8" size={24} />} text={t('firstTimeSetup.step3', "Finally, you can start tracking your shifts and earnings.")} />
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('DriverSetup')}
            style={{ width: '100%', marginTop: 24, paddingVertical: 12, backgroundColor: '#2563EB', borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
          >
            <Check color="white" size={20} />
            <Text style={{ color: 'white', fontWeight: '600', textAlign: 'center', fontSize: 18 }}>
              {t('firstTimeSetup.button', "Let's Go!")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default FirstTimeSetupGuide;
