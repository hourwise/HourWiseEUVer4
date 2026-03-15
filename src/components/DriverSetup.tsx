import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Save, Plus, Trash2, X } from 'react-native-feather';
import { Session } from '@supabase/supabase-js';
import { useAuth } from '../providers/AuthProvider';
import type { Database } from '../lib/database.types';

type Invite = Database['public']['Tables']['driver_invites']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

type OvertimeUnit = 'day' | 'week' | 'month';
type AllowanceUnit = 'hour' | 'day' | 'week' | 'month' | 'shift';

interface Tier { id: string; threshold: string; rate: string; unit: OvertimeUnit; }
interface AllowanceTier { id:string; amount: string; unit: AllowanceUnit; }

interface DriverSetupProps {
  session: Session | null;
  onClose?: () => void;
  route?: { params?: { invite?: Invite } };
}

const createOvertimeTier = (): Tier => ({ id: Math.random().toString(36).substring(7), threshold: '', rate: '', unit: 'week' });
const createAllowanceTier = (): AllowanceTier => ({ id: Math.random().toString(36).substring(7), amount: '', unit: 'shift' });

const UnitSelector = ({ value, options, onChange, disabled }: { value: string, options: string[], onChange: (newValue: string) => void, disabled?: boolean }) => {
    const currentIndex = options.indexOf(value);
    const nextIndex = (currentIndex + 1) % options.length;
    return (
        <TouchableOpacity
            style={disabled ? [styles.unitSelector, styles.disabled] : styles.unitSelector}
            onPress={disabled ? undefined : () => onChange(options[nextIndex])}
            disabled={disabled}
        >
            <Text style={styles.unitSelectorText}>{value}</Text>
        </TouchableOpacity>
    );
};

const DriverSetup: React.FC<DriverSetupProps> = ({ session, onClose, route }) => {
    const { t } = useTranslation();
    const { profile, refreshProfile, isFleetDriver: isFleetDriverFromAuth, loading: authLoading } = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const isFleetDriver = !!route?.params?.invite || isFleetDriverFromAuth;

    const [fullName, setFullName] = useState('');
    const [payrollNumber, setPayrollNumber] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [unpaidBreakMinutes, setUnpaidBreakMinutes] = useState('');
    const [overtimeThreshold, setOvertimeThreshold] = useState('');
    const [overtimeThresholdUnit, setOvertimeThresholdUnit] = useState<OvertimeUnit>('week');
    const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5');
    const [additionalTiers, setAdditionalTiers] = useState<Tier[]>([]);
    const [allowanceTiers, setAllowanceTiers] = useState<AllowanceTier[]>([]);

    useEffect(() => {
        const invite = route?.params?.invite;
        if (invite && invite.pay_config_snapshot) {
            const payConfig = invite.pay_config_snapshot as any;
            setFullName(invite.full_name || '');
            setPayrollNumber(payConfig?.payroll_number || '');
            setHourlyRate(payConfig.hourly_rate?.toString() || '');
            setUnpaidBreakMinutes(payConfig.unpaid_break_minutes?.toString() || '');
            setOvertimeThreshold(payConfig.overtime_threshold_hours?.toString() || '');
            setOvertimeThresholdUnit(payConfig.overtime_threshold_unit as OvertimeUnit || 'week');
            setOvertimeMultiplier(payConfig.overtime_rate_multiplier?.toString() || '1.5');

            if (Array.isArray(payConfig.additional_overtime_tiers)) {
                setAdditionalTiers(payConfig.additional_overtime_tiers.map((t: any) => ({
                    id: Math.random().toString(36).substring(7),
                    threshold: t.threshold?.toString() || '',
                    rate: t.rate?.toString() || '',
                    unit: (t.unit as OvertimeUnit) || 'week'
                })));
            }
            if (Array.isArray(payConfig.allowance_tiers)) {
                setAllowanceTiers(payConfig.allowance_tiers.map((t: any) => ({
                    id: Math.random().toString(36).substring(7),
                    amount: t.amount?.toString() || '',
                    unit: (t.unit as AllowanceUnit) || 'shift'
                })));
            }
            return;
        }

        if (profile) {
            setFullName(profile.full_name || '');
            setPayrollNumber(profile.payroll_number || '');
            if (profile.pay_configurations) {
                const pc = profile.pay_configurations as any;
                setHourlyRate(pc.hourly_rate?.toString() || '');
                setUnpaidBreakMinutes(pc.unpaid_break_minutes?.toString() || '');
                setOvertimeThreshold(pc.overtime_threshold_hours?.toString() || '');
                setOvertimeThresholdUnit(pc.overtime_threshold_unit as OvertimeUnit || 'week');
                setOvertimeMultiplier(pc.overtime_rate_multiplier?.toString() || '1.5');

                if (Array.isArray(pc.additional_overtime_tiers)) {
                    setAdditionalTiers(pc.additional_overtime_tiers.map((t: any) => ({
                        id: Math.random().toString(36).substring(7),
                        threshold: t.threshold?.toString() || '',
                        rate: t.rate?.toString() || '',
                        unit: (t.unit as OvertimeUnit) || 'week'
                    })));
                }
                if (Array.isArray(pc.allowance_tiers)) {
                    setAllowanceTiers(pc.allowance_tiers.map((t: any) => ({
                        id: Math.random().toString(36).substring(7),
                        amount: t.amount?.toString() || '',
                        unit: (t.unit as AllowanceUnit) || 'shift'
                    })));
                }
            }
        }
    }, [profile, route?.params?.invite]);

    const updateTier = (setter: React.Dispatch<React.SetStateAction<any[]>>, id: string, field: string, value: string) => {
        setter(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const handleSave = async () => {
        if (!session?.user) return Alert.alert("Error", "You are not logged in.");
        if (!fullName.trim()) return Alert.alert("Validation Error", "Please enter your full name.");

        setIsSaving(true);
        try {
            const profileUpdate: any = {
                full_name: fullName.trim(),
                updated_at: new Date().toISOString()
            };
            if (!isFleetDriver) {
                profileUpdate.payroll_number = payrollNumber || null;
            }

            const { error: profileError } = await supabase
                .from('profiles')
                .update(profileUpdate)
                .eq('id', session.user.id);

            if (profileError) throw profileError;

            if (!isFleetDriver) {
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

                const { error: payConfigError } = await supabase
                    .from('pay_configurations')
                    .upsert(payConfigData, { onConflict: 'user_id' });

                if (payConfigError) throw payConfigError;
            }

            await refreshProfile();
            if (onClose) onClose();

        } catch (error: any) {
            Alert.alert("Save Error", error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const showLoading = authLoading && !route?.params?.invite;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t('driverSetup.title')}</Text>
                {onClose ? (
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <X color="white" size={24} />
                    </TouchableOpacity>
                ) : null}
            </View>
            <View style={{ flex: 1 }}>
                {showLoading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#FFFFFF" />
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.section}>
                            <Text style={styles.label}>{t('driverSetup.pleaseEnterName')}</Text>
                            <TextInput
                                style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                value={fullName}
                                onChangeText={setFullName}
                                placeholder="e.g. John Smith"
                                placeholderTextColor="#64748B"
                                editable={!isFleetDriver}
                            />
                        </View>

                        <Text style={styles.subtitle}>{t('payConfiguration', 'Pay Configuration')}</Text>

                        <View style={styles.inlineInputContainer}>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>{t('driverSetup.hourlyRate', 'Hourly Rate (£)')}</Text>
                                <TextInput
                                    style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                    value={hourlyRate}
                                    onChangeText={setHourlyRate}
                                    keyboardType="numeric"
                                    placeholder="15.50"
                                    placeholderTextColor="#64748B"
                                    editable={!isFleetDriver}
                                />
                            </View>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>{t('driverSetup.unpaidBreak', 'Unpaid Break (mins)')}</Text>
                                <TextInput
                                    style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                    value={unpaidBreakMinutes}
                                    onChangeText={setUnpaidBreakMinutes}
                                    keyboardType="numeric"
                                    placeholder="30"
                                    placeholderTextColor="#64748B"
                                    editable={!isFleetDriver}
                                />
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('driverSetup.overtime', 'Overtime')}</Text>
                            <View style={styles.inlineInputContainer}>
                                <View style={{flex: 1}}>
                                    <Text style={styles.label}>{t('driverSetup.threshold', 'OT Threshold (hrs)')}</Text>
                                    <TextInput
                                        style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                        value={overtimeThreshold}
                                        onChangeText={setOvertimeThreshold}
                                        keyboardType="numeric"
                                        placeholder="40"
                                        placeholderTextColor="#64748B"
                                        editable={!isFleetDriver}
                                    />
                                </View>
                                <View style={{flex: 1}}>
                                    <Text style={styles.label}>{t('driverSetup.unit', 'Unit')}</Text>
                                    <UnitSelector value={overtimeThresholdUnit} options={['week', 'day', 'month']} onChange={(val) => setOvertimeThresholdUnit(val as OvertimeUnit)} disabled={isFleetDriver} />
                                </View>
                                <View style={{flex: 1}}>
                                    <Text style={styles.label}>{t('driverSetup.multiplier', 'OT Multiplier')}</Text>
                                    <TextInput
                                        style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                        value={overtimeMultiplier}
                                        onChangeText={setOvertimeMultiplier}
                                        keyboardType="numeric"
                                        placeholder="1.5"
                                        placeholderTextColor="#64748B"
                                        editable={!isFleetDriver}
                                    />
                                </View>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('driverSetup.shiftAllowances', 'Allowances')}</Text>
                            {allowanceTiers.map((tier) => (
                                <View key={tier.id} style={styles.inlineInputContainer}>
                                    <View style={{flex: 2}}>
                                        <Text style={styles.label}>{t('driverSetup.rate', 'Amount (£)')}</Text>
                                        <TextInput
                                            style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                            value={tier.amount}
                                            onChangeText={(v) => updateTier(setAllowanceTiers, tier.id, 'amount', v)}
                                            keyboardType="numeric"
                                            editable={!isFleetDriver}
                                        />
                                    </View>
                                    <View style={{flex: 2}}>
                                        <Text style={styles.label}>{t('driverSetup.unit', 'Unit')}</Text>
                                        <UnitSelector value={tier.unit} options={['shift', 'hour', 'day', 'week', 'month']} onChange={(val) => updateTier(setAllowanceTiers, tier.id, 'unit', val)} disabled={isFleetDriver} />
                                    </View>
                                    {!isFleetDriver ? (
                                        <TouchableOpacity style={styles.removeButton} onPress={() => setAllowanceTiers(prev => prev.filter(t => t.id !== tier.id))}>
                                            <Trash2 size={20} color="#F87171" />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            {!isFleetDriver ? (
                                <TouchableOpacity style={styles.addButton} onPress={() => setAllowanceTiers(prev => [...prev, createAllowanceTier()])}>
                                    <Plus size={16} color="#FFFFFF" />
                                    <Text style={styles.addButtonText}>{t('driverSetup.addAllowance', 'Add Allowance')}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('driverSetup.additionalOvertime', 'Additional Overtime Tiers')}</Text>
                            {additionalTiers.map((tier) => (
                                <View key={tier.id} style={styles.inlineInputContainer}>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.label}>{t('driverSetup.threshold', 'After (hrs)')}</Text>
                                        <TextInput
                                            style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                            value={tier.threshold}
                                            onChangeText={(v) => updateTier(setAdditionalTiers, tier.id, 'threshold', v)}
                                            keyboardType="numeric"
                                            editable={!isFleetDriver}
                                        />
                                    </View>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.label}>{t('driverSetup.unit', 'Unit')}</Text>
                                        <UnitSelector value={tier.unit} options={['week', 'day', 'month']} onChange={(val) => updateTier(setAdditionalTiers, tier.id, 'unit', val)} disabled={isFleetDriver} />
                                    </View>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.label}>{t('driverSetup.rate', 'New Rate')}</Text>
                                        <TextInput
                                            style={isFleetDriver ? [styles.input, styles.disabled] : styles.input}
                                            value={tier.rate}
                                            onChangeText={(v) => updateTier(setAdditionalTiers, tier.id, 'rate', v)}
                                            keyboardType="numeric"
                                            editable={!isFleetDriver}
                                        />
                                    </View>
                                    {!isFleetDriver ? (
                                        <TouchableOpacity style={styles.removeButton} onPress={() => setAdditionalTiers(prev => prev.filter(t => t.id !== tier.id))}>
                                            <Trash2 size={20} color="#F87171" />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            {!isFleetDriver ? (
                                <TouchableOpacity style={styles.addButton} onPress={() => setAdditionalTiers(prev => [...prev, createOvertimeTier()])}>
                                    <Plus size={16} color="#FFFFFF" />
                                    <Text style={styles.addButtonText}>{t('driverSetup.addTier', 'Add Overtime Tier')}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </ScrollView>
                )}
            </View>
            <View style={styles.buttonContainer}>
              <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={isSaving}>
                {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Save size={20} color="#FFFFFF" />
                        <Text style={styles.saveButtonText}>{t('driverSetup.save', 'Save & Continue')}</Text>
                    </View>
                )}
              </TouchableOpacity>
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
    disabled: { backgroundColor: '#334155', color: '#94A3B8' },
    buttonContainer: { flexDirection: 'row', gap: 12, padding: 24, borderTopWidth: 1, borderTopColor: '#1E293B' },
    saveButton: { flex: 1, padding: 16, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
    saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    subtitle: { fontSize: 18, color: '#94A3B8', marginBottom: 24, textAlign: 'center' },
    sectionTitle: { fontSize: 20, fontWeight: '600', color: 'white', marginBottom: 12 },
    inlineInputContainer: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
    unitSelector: { backgroundColor: '#334155', height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12 },
    unitSelectorText: { color: 'white', fontWeight: '600', textTransform: 'capitalize' },
    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#334155', padding: 12, borderRadius: 8, marginTop: 8 },
    addButtonText: { color: 'white', fontWeight: '600' },
    removeButton: { paddingVertical: 10 },
});

export default DriverSetup;
