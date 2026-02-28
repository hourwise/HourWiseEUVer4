import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Save, Plus, Trash2, X } from 'react-native-feather';
import { Session } from '@supabase/supabase-js';
import { useAuth } from '../providers/AuthProvider';

// Types
type OvertimeUnit = 'day' | 'week' | 'month';
type AllowanceUnit = 'hour' | 'day' | 'week' | 'month' | 'shift';

interface Tier { id: string; threshold: string; rate: string; unit: OvertimeUnit; }
interface AllowanceTier { id:string; amount: string; unit: AllowanceUnit; }

interface DriverSetupProps {
  session: Session | null;
  onClose?: () => void;
}

const createOvertimeTier = (): Tier => ({ id: Math.random().toString(36).substring(7), threshold: '', rate: '', unit: 'week' });
const createAllowanceTier = (): AllowanceTier => ({ id: Math.random().toString(36).substring(7), amount: '', unit: 'shift' });

const UnitSelector = ({ value, options, onChange }: { value: string, options: string[], onChange: (newValue: string) => void }) => {
    const currentIndex = options.indexOf(value);
    const nextIndex = (currentIndex + 1) % options.length;
    return (
        <TouchableOpacity style={styles.unitSelector} onPress={() => onChange(options[nextIndex])}>
            <Text style={styles.unitSelectorText}>{value}</Text>
        </TouchableOpacity>
    );
};

const DriverSetup: React.FC<DriverSetupProps> = ({ session, onClose }) => {
    const { t } = useTranslation();
    const { refreshProfile } = useAuth(); // We only need refreshProfile now
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [fullName, setFullName] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [unpaidBreakMinutes, setUnpaidBreakMinutes] = useState('');
    const [overtimeThreshold, setOvertimeThreshold] = useState('');
    const [overtimeThresholdUnit, setOvertimeThresholdUnit] = useState<OvertimeUnit>('week');
    const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5');
    const [additionalTiers, setAdditionalTiers] = useState<Tier[]>([]);
    const [allowanceTiers, setAllowanceTiers] = useState<AllowanceTier[]>([]);

    useEffect(() => {
        const fetchExistingData = async () => {
             if (!session?.user) { setLoading(false); return; }
            setLoading(true);
            try {
                const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                if (profileError && profileError.code !== 'PGRST116') throw profileError;
                if (profile) setFullName(profile.full_name || '');

                const { data: payConfig, error: payError } = await supabase.from('pay_configurations').select('*').eq('user_id', session.user.id).single();
                if (payError && payError.code !== 'PGRST116') throw payError;
                 if (payConfig) {
                    const mapTiers = (tiers: any) => (tiers && Array.isArray(tiers) && tiers.length > 0) ? tiers.map(t => ({ ...t, id: Math.random().toString(36).substring(7) })) : [];
                    setHourlyRate(payConfig.hourly_rate?.toString() || '');
                    setUnpaidBreakMinutes(payConfig.unpaid_break_minutes?.toString() || '');
                    setOvertimeThreshold(payConfig.overtime_threshold_hours?.toString() || '');
                    setOvertimeThresholdUnit(payConfig.overtime_threshold_unit as OvertimeUnit || 'week');
                    setOvertimeMultiplier(payConfig.overtime_rate_multiplier?.toString() || '1.5');
                    setAdditionalTiers(mapTiers(payConfig.additional_overtime_tiers));
                    setAllowanceTiers(mapTiers(payConfig.allowance_tiers));
                 }
            } catch (error: any) {
                console.error("Error fetching setup data:", error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchExistingData();
    }, [session]);

    const addTier = (setter: React.Dispatch<React.SetStateAction<any[]>>, creator: () => any) => setter(prev => [...prev, creator()]);
    const removeTier = (setter: React.Dispatch<React.SetStateAction<any[]>>, id: string) => setter(prev => prev.filter(t => t.id !== id));
    const updateTier = (setter: React.Dispatch<React.SetStateAction<any[]>>, id: string, field: string, value: string) => setter(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

    const handleSave = async () => {
        if (!session?.user) return Alert.alert("Error", "You are not logged in.");
        if (!fullName.trim()) return Alert.alert("Validation Error", "Please enter your full name.");

        setIsSaving(true);
        try {
            const { error: profileError } = await supabase.from('profiles').upsert({ id: session.user.id, user_id: session.user.id, full_name: fullName.trim(), email: session.user.email }, { onConflict: 'id' });
            if (profileError) throw profileError;

            const payConfigData = {
                user_id: session.user.id,
                hourly_rate: parseFloat(hourlyRate) || 0,
                unpaid_break_minutes: parseInt(unpaidBreakMinutes, 10) || 0,
                overtime_threshold_hours: parseFloat(overtimeThreshold) || null,
                overtime_threshold_unit: overtimeThresholdUnit,
                overtime_rate_multiplier: parseFloat(overtimeMultiplier) || null,
                additional_overtime_tiers: additionalTiers.filter(t => t.threshold && t.rate).map(t => ({ threshold: parseFloat(t.threshold), rate: parseFloat(t.rate), unit: t.unit })),
                allowance_tiers: allowanceTiers.filter(t => t.amount).map(t => ({ amount: parseFloat(t.amount), unit: t.unit })),
            };
            const { error: payConfigError } = await supabase.from('pay_configurations').upsert(payConfigData, { onConflict: 'user_id' });
            if (payConfigError) throw payConfigError;

            // This will now trigger the AuthProvider to re-check the setup status
            // and the AppNavigator will react automatically.
            await refreshProfile();

            if (onClose) onClose();
        } catch (error: any) {
            Alert.alert("Save Error", error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
             <View style={styles.header}>
                <Text style={styles.title}>{t('driverSetup.title')}</Text>
                {onClose && <TouchableOpacity onPress={onClose} style={styles.closeButton}><X color="white" size={24} /></TouchableOpacity>}
            </View>
            {loading ? <ActivityIndicator size="large" color="#FFFFFF" /> : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                     <View style={styles.section}>
                        <Text style={styles.label}>{t('driverSetup.pleaseEnterName')}</Text>
                        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="e.g. John Smith" placeholderTextColor="#64748B" />
                    </View>
                    <Text style={styles.subtitle}>{t('payConfiguration', 'Pay Configuration (Optional)')}</Text>

                    <View style={styles.inlineInputContainer}><View style={{flex: 1}}><Text style={styles.label}>Hourly Rate (£)</Text><TextInput style={styles.input} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="numeric" placeholder="15.50" placeholderTextColor="#64748B" /></View><View style={{flex: 1}}><Text style={styles.label}>Unpaid Break (mins)</Text><TextInput style={styles.input} value={unpaidBreakMinutes} onChangeText={setUnpaidBreakMinutes} keyboardType="numeric" placeholder="30" placeholderTextColor="#64748B" /></View></View>
                    <View style={styles.section}><Text style={styles.sectionTitle}>Overtime</Text><View style={styles.inlineInputContainer}><View style={{flex: 1}}><Text style={styles.label}>OT Threshold (hrs)</Text><TextInput style={styles.input} value={overtimeThreshold} onChangeText={setOvertimeThreshold} keyboardType="numeric" placeholder="40" placeholderTextColor="#64748B" /></View><View style={{flex: 1}}><Text style={styles.label}>Unit</Text><UnitSelector value={overtimeThresholdUnit} options={['week', 'day', 'month']} onChange={(val) => setOvertimeThresholdUnit(val as OvertimeUnit)} /></View><View style={{flex: 1}}><Text style={styles.label}>OT Multiplier</Text><TextInput style={styles.input} value={overtimeMultiplier} onChangeText={setOvertimeMultiplier} keyboardType="numeric" placeholder="1.5" placeholderTextColor="#64748B" /></View></View></View>
                    <View style={styles.section}><Text style={styles.sectionTitle}>Allowances</Text>{allowanceTiers.map((tier) => (<View key={tier.id} style={styles.inlineInputContainer}><View style={{flex: 2}}><Text style={styles.label}>Amount (£)</Text><TextInput style={styles.input} value={tier.amount} onChangeText={(v) => updateTier(setAllowanceTiers, tier.id, 'amount', v)} keyboardType="numeric" /></View><View style={{flex: 2}}><Text style={styles.label}>Unit</Text><UnitSelector value={tier.unit} options={['shift', 'hour', 'day', 'week', 'month']} onChange={(v) => updateTier(setAllowanceTiers, tier.id, 'unit', v)} /></View><TouchableOpacity style={styles.removeButton} onPress={() => removeTier(setAllowanceTiers, tier.id)}><Trash2 size={20} color="#F87171" /></TouchableOpacity></View>))}<TouchableOpacity style={styles.addButton} onPress={() => addTier(setAllowanceTiers, createAllowanceTier)}><Plus size={16} color="#FFFFFF" /><Text style={styles.addButtonText}>Add Allowance</Text></TouchableOpacity></View>
                    <View style={styles.section}><Text style={styles.sectionTitle}>Additional Overtime Tiers</Text>{additionalTiers.map((tier) => (<View key={tier.id} style={styles.inlineInputContainer}><View style={{flex: 1}}><Text style={styles.label}>After (hrs)</Text><TextInput style={styles.input} value={tier.threshold} onChangeText={(v) => updateTier(setAdditionalTiers, tier.id, 'threshold', v)} keyboardType="numeric" /></View><View style={{flex: 1}}><Text style={styles.label}>Unit</Text><UnitSelector value={tier.unit} options={['week', 'day', 'month']} onChange={(v) => updateTier(setAdditionalTiers, tier.id, 'unit', v)} /></View><View style={{flex: 1}}><Text style={styles.label}>New Rate</Text><TextInput style={styles.input} value={tier.rate} onChangeText={(v) => updateTier(setAdditionalTiers, tier.id, 'rate', v)} keyboardType="numeric" /></View><TouchableOpacity style={styles.removeButton} onPress={() => removeTier(setAdditionalTiers, tier.id)}><Trash2 size={20} color="#F87171" /></TouchableOpacity></View>))}<TouchableOpacity style={styles.addButton} onPress={() => addTier(setAdditionalTiers, createOvertimeTier)}><Plus size={16} color="#FFFFFF" /><Text style={styles.addButtonText}>Add Overtime Tier</Text></TouchableOpacity></View>
                </ScrollView>
            )}
             <View style={styles.buttonContainer}>
                {onClose ? (
                    <TouchableOpacity onPress={onClose} style={styles.skipButton}><Text style={styles.skipButtonText}>Close</Text></TouchableOpacity>
                ) : (
                    <View style={styles.skipButton} />
                )}
                <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={20} color="#FFFFFF" /><Text style={styles.saveButtonText}>Save</Text></>}</TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    header: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 24, paddingBottom: 12, position: 'relative' },
    title: { fontSize: 24, fontWeight: 'bold', color: 'white', textAlign: 'center' },
    closeButton: { position: 'absolute', right: 24, top: 24 },
    scrollContent: { padding: 24, paddingTop: 12 },
    section: { marginBottom: 24 },
    label: { fontSize: 14, color: '#94A3B8', marginBottom: 8 },
    input: { backgroundColor: '#1E293B', color: 'white', padding: 12, borderRadius: 8, fontSize: 16 },
    buttonContainer: { flexDirection: 'row', gap: 12, padding: 24, borderTopWidth: 1, borderTopColor: '#1E293B' },
    skipButton: { flex: 1 },
    saveButton: { flex: 2, padding: 16, borderRadius: 8, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    subtitle: { fontSize: 18, color: '#94A3B8', marginBottom: 24, textAlign: 'center' },
    sectionTitle: { fontSize: 20, fontWeight: '600', color: 'white', marginBottom: 12 },
    inlineInputContainer: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
    unitSelector: { backgroundColor: '#334155', height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12 },
    unitSelectorText: { color: 'white', fontWeight: '600', textTransform: 'capitalize' },
    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#334155', padding: 12, borderRadius: 8, marginTop: 8 },
    addButtonText: { color: 'white', fontWeight: '600' },
    removeButton: { paddingTop: 30 },
});

export default DriverSetup;
