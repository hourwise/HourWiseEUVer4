import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { X, Save, Briefcase, Upload, Trash } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

interface BusinessProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function BusinessProfileModal({ visible, onClose }: BusinessProfileModalProps) {
  const { t, ready } = useTranslation();

  const [legalName, setLegalName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!visible || !ready) return;
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setLegalName(data.legal_name || '');
          setAddress(data.address || '');
          setEmail(data.email || '');
          setPhone(data.phone || '');
          setTaxId(data.tax_id || '');
          setBankAccountName(data.bank_account_name || '');
          setBankSortCode(data.bank_sort_code || '');
          setBankAccountNumber(data.bank_account_number || '');
          setIban(data.iban || '');
          setLogoUrl(data.logo_url || null);
        }
      } catch (err) {
        console.error('Failed to load business profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [visible, ready]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your photos to upload a logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      handleUploadImage(result.assets[0].base64, result.assets[0].uri.split('.').pop());
    }
  };

  const handleUploadImage = async (base64: string, fileExt: string | undefined) => {
    if (!base64 || !fileExt) return;
    setLoading(true);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not found");

        const filePath = `${user.id}/${new Date().getTime()}.${fileExt}`;
        const { error } = await supabase.storage
            .from('logos')
            .upload(filePath, decode(base64), {
                contentType: `image/${fileExt === 'jpg' ? 'jpeg' : 'png'}`,
            });
        
        if (error) throw error;
        
        const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filePath);
        setLogoUrl(publicUrlData.publicUrl);

    } catch(err: any) {
        Alert.alert('Upload Error', err.message || 'Failed to upload image.');
    } finally {
        setLoading(false);
    }
  };
  
  const handleRemoveLogo = () => {
      setLogoUrl(null);
  }

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);

    try {
      const profileData = {
        user_id: user.id,
        legal_name: legalName,
        address,
        email,
        phone,
        tax_id: taxId,
        bank_account_name: bankAccountName,
        bank_sort_code: bankSortCode,
        bank_account_number: bankAccountNumber,
        iban,
        logo_url: logoUrl,
      };

      const { error } = await supabase.from('business_profiles').upsert(profileData, { onConflict: 'user_id' });
      if (error) throw error;

      Alert.alert(t('common.success'), t('businessProfile.alerts.profileSaved'));
      onClose();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('common.failedToSave'));
    } finally {
      setLoading(false);
    }
  };

  if (!ready && visible) {
    return (
      <Modal visible={visible} transparent>
        <View className="flex-1 justify-center items-center bg-black/70">
          <ActivityIndicator size="large" color="white" />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/70 p-4">
        <View className="bg-white rounded-lg shadow-xl w-full" style={{ maxHeight: '90%' }}>
          <View className="bg-gray-100 border-b border-gray-200 px-6 py-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-gray-900">{t('businessProfile.title')}</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={24} color="gray" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator size="large" className="my-16" />
            ) : (
              <View className="space-y-6">
                
                {/* Logo Section */}
                <View className="space-y-2 items-center">
                    <Text className="text-lg font-semibold text-gray-900">{t('businessProfile.sections.companyLogo')}</Text>
                    {logoUrl ? (
                        <View className="items-center">
                            <Image source={{ uri: logoUrl }} className="w-32 h-24 rounded-lg border border-gray-200" resizeMode="contain" />
                            <TouchableOpacity onPress={handleRemoveLogo} className="flex-row items-center gap-2 mt-2 bg-red-100 p-2 rounded-md">
                                <Trash size={16} color="red" />
                                <Text className="text-red-600 font-semibold">{t('common.remove')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={handlePickImage} className="w-32 h-24 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 justify-center items-center">
                            <Upload size={24} color="gray" />
                            <Text className="text-xs text-gray-500 mt-1">{t('common.upload')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Company Details */}
                <View className="space-y-4 pt-4 border-t border-gray-200">
                  <View className="flex-row items-center gap-2">
                    <Briefcase size={20} color="black" />
                    <Text className="text-lg font-semibold text-gray-900">{t('businessProfile.sections.companyDetails')}</Text>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.legalName.label')}</Text>
                    <TextInput value={legalName} onChangeText={setLegalName} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.legalName.placeholder')} />
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.address.label')}</Text>
                    <TextInput value={address} onChangeText={setAddress} multiline className="w-full px-4 py-2 border border-gray-300 rounded-lg h-24" placeholder={t('businessProfile.fields.address.placeholder')} />
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1"><Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.email.label')}</Text><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.email.placeholder')} /></View>
                    <View className="flex-1"><Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.phone.label')}</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.phone.placeholder')} /></View>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.taxId.label')}</Text>
                    <TextInput value={taxId} onChangeText={setTaxId} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.taxId.placeholder')} />
                  </View>
                </View>

                {/* Bank Details */}
                <View className="space-y-4 pt-4 border-t border-gray-200">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-lg font-semibold text-gray-900">{t('businessProfile.sections.bankDetails')}</Text>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.accountName.label')}</Text>
                    <TextInput value={bankAccountName} onChangeText={setBankAccountName} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.accountName.placeholder')} />
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1"><Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.sortCode.label')}</Text><TextInput value={bankSortCode} onChangeText={setBankSortCode} keyboardType="numeric" className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.sortCode.placeholder')} /></View>
                    <View className="flex-1"><Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.accountNumber.label')}</Text><TextInput value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="numeric" className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.accountNumber.placeholder')} /></View>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">{t('businessProfile.fields.iban.label')}</Text>
                    <TextInput value={iban} onChangeText={setIban} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder={t('businessProfile.fields.iban.placeholder')} />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View className="p-4 border-t border-gray-200 flex-row justify-end">
            <TouchableOpacity onPress={handleSave} disabled={loading} className="px-6 py-3 rounded-lg bg-blue-600 shadow-sm flex-row items-center gap-2">
              {loading ? <ActivityIndicator color="white" /> : <Save size={18} color="white" />}
              <Text className="text-center font-bold text-white">{loading ? t('common.saving') : t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}