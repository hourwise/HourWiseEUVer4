import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { X, Save, Briefcase, Upload, Trash, Plus, User, Mail, MapPin, Clock, Truck, Map, DollarSign } from 'react-native-feather';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

interface CustomLineItem {
  description: string;
  amount: number;
  unit: string;
}

interface Client {
  id: string;
  name: string;
  address: string;
  email: string;
  payment_terms?: string;
  notes?: string;
  billing_types?: string[]; // 'hourly', 'daily', 'ppm', 'job'
  hourly_rate?: number;
  daily_rate?: number;
  night_out_rate?: number;
  ppm_loaded_rate?: number;
  ppm_empty_rate?: number;
  fuel_surcharge_pct?: number;
  waiting_time_free_minutes?: number;
  waiting_time_rate?: number;
  custom_line_items?: CustomLineItem[];
}

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
  const [vatNumber, setVatNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Payment due within 30 days');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && ready) {
      loadProfile();
      loadClients();
    }
  }, [visible, ready]);

  const loadProfile = async () => {
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
        setVatNumber(data.vat_number || '');
        setPaymentTerms(data.payment_terms || 'Payment due within 30 days');
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

  const loadClients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Failed to load clients:', err);
    }
  };

  const handleSaveClient = async () => {
    if (!editingClient?.name) {
      Alert.alert(t('common.error'), 'Client name is required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const clientData = {
        ...editingClient,
        user_id: user.id
      };

      const { error } = await supabase.from('clients').upsert(clientData);
      if (error) throw error;

      loadClients();
      setShowClientModal(false);
      setEditingClient(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleDeleteClient = async (id: string) => {
    Alert.alert(
      t('common.delete'),
      t('businessProfile.clients.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('clients').delete().eq('id', id);
            if (error) Alert.alert(t('common.error'), error.message);
            else loadClients();
          }
        }
      ]
    );
  };

  const toggleBillingType = (type: string) => {
    const currentTypes = editingClient?.billing_types || [];
    if (currentTypes.includes(type)) {
      setEditingClient({ ...editingClient, billing_types: currentTypes.filter(t => t !== type) });
    } else {
      setEditingClient({ ...editingClient, billing_types: [...currentTypes, type] });
    }
  };

  const addCustomItem = () => {
    const items = editingClient?.custom_line_items || [];
    setEditingClient({
      ...editingClient,
      custom_line_items: [...items, { description: '', amount: 0, unit: 'fixed' }]
    });
  };

  const updateCustomItem = (index: number, field: keyof CustomLineItem, value: any) => {
    const items = [...(editingClient?.custom_line_items || [])];
    items[index] = { ...items[index], [field]: value };
    setEditingClient({ ...editingClient, custom_line_items: items });
  };

  const removeCustomItem = (index: number) => {
    const items = [...(editingClient?.custom_line_items || [])];
    items.splice(index, 1);
    setEditingClient({ ...editingClient, custom_line_items: items });
  };

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
        vat_number: vatNumber,
        payment_terms: paymentTerms,
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
      <View className="flex-1 bg-brand-dark">
        <View className="flex-1 bg-brand-dark">
          <View className="bg-brand-accent border-b border-slate-700 px-6 py-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-white">{t('businessProfile.title')}</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={24} color="white" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false} className="bg-brand-dark">
            {loading ? (
              <ActivityIndicator size="large" className="my-16" color="#60a5fa" />
            ) : (
              <View className="space-y-6">
                
                {/* Logo Section */}
                <View className="space-y-2 items-center">
                    <Text className="text-lg font-semibold text-white">{t('businessProfile.sections.companyLogo')}</Text>
                    {logoUrl ? (
                        <View className="items-center">
                            <Image source={{ uri: logoUrl }} className="w-32 h-24 rounded-lg border border-slate-600 bg-slate-800" resizeMode="contain" />
                            <TouchableOpacity onPress={handleRemoveLogo} className="flex-row items-center gap-2 mt-2 bg-red-500/20 p-2 rounded-md border border-red-500/50">
                                <Trash size={16} color="#ef4444" />
                                <Text className="text-red-400 font-semibold">{t('common.remove')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={handlePickImage} className="w-32 h-24 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 justify-center items-center">
                            <Upload size={24} color="#64748b" />
                            <Text className="text-xs text-slate-400 mt-1">{t('common.upload')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Company Details */}
                <View className="space-y-4 pt-4 border-t border-slate-700">
                  <View className="flex-row items-center gap-2">
                    <Briefcase size={20} color="#60a5fa" />
                    <Text className="text-lg font-semibold text-white">{t('businessProfile.sections.companyDetails')}</Text>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.legalName.label')}</Text>
                    <TextInput value={legalName} onChangeText={setLegalName} className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.legalName.placeholder')} placeholderTextColor="#64748b" />
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.address.label')}</Text>
                    <TextInput value={address} onChangeText={setAddress} multiline className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white h-24" placeholder={t('businessProfile.fields.address.placeholder')} placeholderTextColor="#64748b" />
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1"><Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.email.label')}</Text><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.email.placeholder')} placeholderTextColor="#64748b" /></View>
                    <View className="flex-1"><Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.phone.label')}</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.phone.placeholder')} placeholderTextColor="#64748b" /></View>
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.taxId.label')}</Text>
                      <TextInput value={taxId} onChangeText={setTaxId} className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.taxId.placeholder')} placeholderTextColor="#64748b" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.vatNumber.label')}</Text>
                      <TextInput value={vatNumber} onChangeText={setVatNumber} className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.vatNumber.placeholder')} placeholderTextColor="#64748b" />
                    </View>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.paymentTerms.label')}</Text>
                    <TextInput value={paymentTerms} onChangeText={setPaymentTerms} className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.paymentTerms.placeholder')} placeholderTextColor="#64748b" />
                  </View>
                </View>

                {/* Bank Details */}
                <View className="space-y-4 pt-4 border-t border-slate-700">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-lg font-semibold text-white">{t('businessProfile.sections.bankDetails')}</Text>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.accountName.label')}</Text>
                    <TextInput value={bankAccountName} onChangeText={setBankAccountName} className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.accountName.placeholder')} placeholderTextColor="#64748b" />
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1"><Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.sortCode.label')}</Text><TextInput value={bankSortCode} onChangeText={setBankSortCode} keyboardType="numeric" className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.sortCode.placeholder')} placeholderTextColor="#64748b" /></View>
                    <View className="flex-1"><Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.accountNumber.label')}</Text><TextInput value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="numeric" className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.accountNumber.placeholder')} placeholderTextColor="#64748b" /></View>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.fields.iban.label')}</Text>
                    <TextInput value={iban} onChangeText={setIban} className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white" placeholder={t('businessProfile.fields.iban.placeholder')} placeholderTextColor="#64748b" />
                  </View>
                </View>

                {/* Client Management Section */}
                <View className="space-y-4 pt-4 border-t border-slate-700">
                    <View className="flex-row items-center justify-between">
                        <Text className="text-lg font-semibold text-white">{t('businessProfile.sections.clients')}</Text>
                        <TouchableOpacity onPress={() => { setEditingClient({ payment_terms: 'Payment due within 30 days', billing_types: [], custom_line_items: [] }); setShowClientModal(true); }} className="flex-row items-center gap-2 bg-brand-accent/20 px-3 py-1.5 rounded-lg border border-brand-accent/50">
                            <Plus size={16} color="#F59E0B" />
                            <Text className="text-brand-accent font-bold">{t('businessProfile.clients.addClient')}</Text>
                        </TouchableOpacity>
                    </View>

                    {clients.length === 0 ? (
                        <Text className="text-slate-500 italic text-center py-4">{t('businessProfile.clients.noClients')}</Text>
                    ) : (
                        <View className="space-y-3">
                            {clients.map(client => (
                                <View key={client.id} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 flex-row justify-between items-center">
                                    <View className="flex-1 mr-4">
                                        <Text className="font-bold text-white">{client.name}</Text>
                                        <Text className="text-xs text-slate-400" numberOfLines={1}>{client.address || 'No address'}</Text>
                                    </View>
                                    <View className="flex-row gap-2">
                                        <TouchableOpacity onPress={() => { setEditingClient(client); setShowClientModal(true); }} className="p-2 bg-slate-700/50 rounded-lg border border-slate-600">
                                            <Briefcase size={16} color="#60a5fa" />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDeleteClient(client.id)} className="p-2 bg-red-500/20 rounded-lg border border-red-500/50">
                                            <Trash size={16} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
              </View>
            )}
          </ScrollView>

          <View className="p-4 border-t border-slate-700 flex-row justify-end bg-brand-dark">
            <TouchableOpacity onPress={handleSave} disabled={loading} className="px-6 py-3 rounded-lg bg-brand-accent shadow-sm flex-row items-center gap-2">
              {loading ? <ActivityIndicator color="white" /> : <Save size={18} color="white" />}
              <Text className="text-center font-bold text-white">{loading ? t('common.saving') : t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Client Edit Modal */}
      <Modal visible={showClientModal} transparent animationType="fade">
          <View className="flex-1 justify-center items-center bg-black/60 p-4">
              <View className="bg-brand-dark w-full rounded-2xl overflow-hidden border border-slate-700" style={{ maxHeight: '90%' }}>
                  <View className="p-6 border-b border-slate-700 flex-row justify-between items-center bg-brand-accent">
                    <Text className="text-xl font-bold text-white">{editingClient?.id ? t('businessProfile.clients.editClient') : t('businessProfile.clients.addClient')}</Text>
                    <TouchableOpacity onPress={() => setShowClientModal(false)}><X size={24} color="white" /></TouchableOpacity>
                  </View>

                  <ScrollView className="p-6">
                    <View className="space-y-4">
                        <View>
                            <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.clients.fields.name')} *</Text>
                            <TextInput
                              value={editingClient?.name}
                              onChangeText={text => setEditingClient(prev => ({ ...prev, name: text }))}
                              className="p-3 border border-slate-600 rounded-xl bg-slate-800 text-white"
                              placeholder="e.g. Acme Logistics"
                              placeholderTextColor="#64748b"
                            />
                        </View>
                        <View>
                            <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.clients.fields.address')}</Text>
                            <TextInput
                              value={editingClient?.address}
                              onChangeText={text => setEditingClient(prev => ({ ...prev, address: text }))}
                              multiline
                              className="p-3 border border-slate-600 rounded-xl bg-slate-800 text-white h-20"
                              placeholder="Full delivery/billing address"
                              placeholderTextColor="#64748b"
                            />
                        </View>
                        <View>
                            <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.clients.fields.email')}</Text>
                            <TextInput
                              value={editingClient?.email}
                              onChangeText={text => setEditingClient(prev => ({ ...prev, email: text }))}
                              keyboardType="email-address"
                              className="p-3 border border-slate-600 rounded-xl bg-slate-800 text-white"
                              placeholder="invoices@client.com"
                              placeholderTextColor="#64748b"
                            />
                        </View>
                        <View>
                            <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.clients.fields.paymentTerms')}</Text>
                            <TextInput
                              value={editingClient?.payment_terms}
                              onChangeText={text => setEditingClient(prev => ({ ...prev, payment_terms: text }))}
                              className="p-3 border border-slate-600 rounded-xl bg-slate-800 text-white"
                              placeholder="e.g. Payment due within 30 days"
                              placeholderTextColor="#64748b"
                            />
                        </View>
                        <View>
                            <Text className="text-sm font-medium text-slate-300 mb-1">{t('businessProfile.clients.fields.notes')}</Text>
                            <TextInput
                              value={editingClient?.notes}
                              onChangeText={text => setEditingClient(prev => ({ ...prev, notes: text }))}
                              multiline
                              className="p-3 border border-slate-600 rounded-xl bg-slate-800 text-white h-20"
                              placeholder="Internal notes about this client"
                              placeholderTextColor="#64748b"
                            />
                        </View>

                        {/* Rate Card Section */}
                        <View className="pt-6 border-t border-slate-700">
                          <Text className="text-lg font-bold text-white mb-4">{t('businessProfile.sections.rateCard')}</Text>

                          <Text className="text-sm font-medium text-slate-300 mb-2">{t('businessProfile.clients.billingTypes')}</Text>
                          <View className="flex-row flex-wrap gap-2 mb-6">
                            {[
                              { id: 'hourly', label: t('businessProfile.clients.hourly'), icon: <Clock size={14} color={editingClient?.billing_types?.includes('hourly') ? 'white' : '#64748b'} /> },
                              { id: 'daily', label: t('businessProfile.clients.daily'), icon: <Truck size={14} color={editingClient?.billing_types?.includes('daily') ? 'white' : '#64748b'} /> },
                              { id: 'ppm', label: t('businessProfile.clients.ppm'), icon: <Map size={14} color={editingClient?.billing_types?.includes('ppm') ? 'white' : '#64748b'} /> },
                              { id: 'job', label: t('businessProfile.clients.job'), icon: <DollarSign size={14} color={editingClient?.billing_types?.includes('job') ? 'white' : '#64748b'} /> }
                            ].map(type => (
                              <TouchableOpacity
                                key={type.id}
                                onPress={() => toggleBillingType(type.id)}
                                className={`flex-row items-center gap-2 px-4 py-2 rounded-full border ${editingClient?.billing_types?.includes(type.id) ? 'bg-brand-accent border-brand-accent' : 'bg-slate-800 border-slate-600'}`}
                              >
                                {type.icon}
                                <Text className={`text-sm font-semibold ${editingClient?.billing_types?.includes(type.id) ? 'text-white' : 'text-slate-400'}`}>{type.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          {/* Hourly Section */}
                          {editingClient?.billing_types?.includes('hourly') && (
                            <View className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 mb-4">
                              <Text className="font-bold text-white mb-3">{t('businessProfile.clients.hourly')}</Text>
                              <View>
                                <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.hourlyRate')}</Text>
                                <TextInput
                                  value={editingClient?.hourly_rate?.toString()}
                                  onChangeText={text => setEditingClient({ ...editingClient, hourly_rate: parseFloat(text) || 0 })}
                                  keyboardType="numeric"
                                  className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                  placeholderTextColor="#64748b"
                                />
                              </View>
                            </View>
                          )}

                          {/* Daily Section */}
                          {editingClient?.billing_types?.includes('daily') && (
                            <View className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 mb-4">
                              <Text className="font-bold text-white mb-3">{t('businessProfile.clients.daily')}</Text>
                              <View className="flex-row gap-3">
                                <View className="flex-1">
                                  <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.dayRate')}</Text>
                                  <TextInput
                                    value={editingClient?.daily_rate?.toString()}
                                    onChangeText={text => setEditingClient({ ...editingClient, daily_rate: parseFloat(text) || 0 })}
                                    keyboardType="numeric"
                                    className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                    placeholderTextColor="#64748b"
                                  />
                                </View>
                                <View className="flex-1">
                                  <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.nightOutRate')}</Text>
                                  <TextInput
                                    value={editingClient?.night_out_rate?.toString()}
                                    onChangeText={text => setEditingClient({ ...editingClient, night_out_rate: parseFloat(text) || 0 })}
                                    keyboardType="numeric"
                                    className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                    placeholderTextColor="#64748b"
                                  />
                                </View>
                              </View>
                            </View>
                          )}

                          {/* PPM Section */}
                          {editingClient?.billing_types?.includes('ppm') && (
                            <View className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 mb-4">
                              <Text className="font-bold text-white mb-3">{t('businessProfile.clients.ppm')}</Text>
                              <View className="space-y-3">
                                <View className="flex-row gap-3">
                                  <View className="flex-1">
                                    <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.ppmLoaded')}</Text>
                                    <TextInput
                                      value={editingClient?.ppm_loaded_rate?.toString()}
                                      onChangeText={text => setEditingClient({ ...editingClient, ppm_loaded_rate: parseFloat(text) || 0 })}
                                      keyboardType="numeric"
                                      className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                      placeholderTextColor="#64748b"
                                    />
                                  </View>
                                  <View className="flex-1">
                                    <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.ppmEmpty')}</Text>
                                    <TextInput
                                      value={editingClient?.ppm_empty_rate?.toString()}
                                      onChangeText={text => setEditingClient({ ...editingClient, ppm_empty_rate: parseFloat(text) || 0 })}
                                      keyboardType="numeric"
                                      className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                      placeholderTextColor="#64748b"
                                    />
                                  </View>
                                </View>
                                <View>
                                  <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.fuelSurcharge')}</Text>
                                  <TextInput
                                    value={editingClient?.fuel_surcharge_pct?.toString()}
                                    onChangeText={text => setEditingClient({ ...editingClient, fuel_surcharge_pct: parseFloat(text) || 0 })}
                                    keyboardType="numeric"
                                    className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                    placeholder="0"
                                    placeholderTextColor="#64748b"
                                  />
                                </View>
                              </View>
                            </View>
                          )}

                          {/* Waiting Time Section */}
                          <View className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 mb-4">
                            <Text className="font-bold text-white mb-3">{t('dashboard.poaButtonText')}</Text>
                            <View className="flex-row gap-3">
                              <View className="flex-1">
                                <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.waitingFree')}</Text>
                                <TextInput
                                  value={(editingClient?.waiting_time_free_minutes ?? 60).toString()}
                                  onChangeText={text => setEditingClient({ ...editingClient, waiting_time_free_minutes: parseInt(text) || 0 })}
                                  keyboardType="numeric"
                                  className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                  placeholderTextColor="#64748b"
                                />
                              </View>
                              <View className="flex-1">
                                <Text className="text-xs font-medium text-slate-400 mb-1">{t('businessProfile.clients.fields.waitingRate')}</Text>
                                <TextInput
                                  value={editingClient?.waiting_time_rate?.toString()}
                                  onChangeText={text => setEditingClient({ ...editingClient, waiting_time_rate: parseFloat(text) || 0 })}
                                  keyboardType="numeric"
                                  className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white"
                                  placeholderTextColor="#64748b"
                                />
                              </View>
                            </View>
                          </View>

                          {/* Custom Line Items Section */}
                          <View className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 mb-4">
                            <View className="flex-row justify-between items-center mb-3">
                              <Text className="font-bold text-white">{t('businessProfile.clients.customItems')}</Text>
                              <TouchableOpacity onPress={addCustomItem} className="bg-brand-accent/20 p-1.5 rounded-full border border-brand-accent/50"><Plus size={16} color="#F59E0B" /></TouchableOpacity>
                            </View>

                            {(editingClient?.custom_line_items || []).map((item, idx) => (
                              <View key={idx} className="bg-slate-800 p-3 rounded-lg border border-slate-600 mb-3">
                                <View className="flex-row justify-between mb-2">
                                  <TextInput
                                    value={item.description}
                                    onChangeText={text => updateCustomItem(idx, 'description', text)}
                                    className="flex-1 text-sm font-semibold text-white mr-2"
                                    placeholder={t('businessProfile.clients.fields.description')}
                                    placeholderTextColor="#64748b"
                                  />
                                  <TouchableOpacity onPress={() => removeCustomItem(idx)}><X size={16} color="#ef4444" /></TouchableOpacity>
                                </View>
                                <View className="flex-row gap-2">
                                  <View className="flex-1">
                                    <Text className="text-[10px] uppercase text-slate-500 font-bold">{t('businessProfile.clients.fields.amount')}</Text>
                                    <TextInput
                                      value={item.amount.toString()}
                                      onChangeText={text => updateCustomItem(idx, 'amount', parseFloat(text) || 0)}
                                      keyboardType="numeric"
                                      className="text-sm p-1 border-b border-slate-600 text-white"
                                      placeholderTextColor="#64748b"
                                    />
                                  </View>
                                  <View className="flex-1">
                                    <Text className="text-[10px] uppercase text-slate-500 font-bold">{t('businessProfile.clients.fields.unit')}</Text>
                                    <TextInput
                                      value={item.unit}
                                      onChangeText={text => updateCustomItem(idx, 'unit', text)}
                                      className="text-sm p-1 border-b border-slate-600 text-white"
                                      placeholder="e.g. per shift"
                                      placeholderTextColor="#64748b"
                                    />
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                    </View>
                  </ScrollView>

                  <View className="p-6 border-t border-slate-700 flex-row gap-3 bg-brand-dark">
                      <TouchableOpacity onPress={() => setShowClientModal(false)} className="flex-1 p-4 rounded-xl bg-slate-800 border border-slate-600">
                          <Text className="text-center font-bold text-slate-300">{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveClient} className="flex-1 p-4 rounded-xl bg-brand-accent">
                          <Text className="text-center font-bold text-white">{t('common.save')}</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
    </Modal>
  );
}
