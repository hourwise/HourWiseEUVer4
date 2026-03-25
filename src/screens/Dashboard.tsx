import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Modal,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  AppState,
  Platform,
  Alert,
} from 'react-native';
import {
  Menu,
  Book,
  FileText,
  AlertTriangle,
  Calendar,
  Download,
  Coffee,
  Truck,
  User,
  Tool,
  Shield,
  Globe,
  Bell,
  DollarSign,
  CheckCircle,
  Clock,
} from 'react-native-feather';
import { Session } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase, getLatestBroadcasts, getSystemMessages } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../providers/AuthProvider';
import * as Notifications from 'expo-notifications';

// --- Components ---
import { DigitalClock } from '../components/DigitalClock';
import DriverSetup from '../components/DriverSetup';
import SettingsMenu from '../components/SettingsMenu';
import Instructions from '../components/Instructions';
import PrivacyInfo from '../components/PrivacyInfo';
import EUWorkingTimeRules from '../components/EUWorkingTimeRules';
import DigitalTachographGuide from '../components/DigitalTachographGuide';
import ComplianceHeatmap from '../components/ComplianceHeatmap';
import ComplianceHeatmapSummary from '../components/ComplianceHeatmapSummary';
import CalendarView from '../components/CalendarView';
import DownloadReportModal from '../components/DownloadReportModal';
import LanguageSelector from '../components/LanguageSelector';
import SafetyWarningModal from '../components/SafetyWarningModal';
import BusinessProfileModal from '../components/BusinessProfileModal';
import { FatigueMonitor } from '../components/FatigueMonitor';
import DailyComplianceReportModal from '../components/DailyComplianceReportModal';
import EndShiftConfirmationModal from '../components/EndShiftConfirmationModal';
import AddExpenseModal from '../components/AddExpenseModal';
import VehicleChecklistModal from '../components/VehicleChecklistModal';
import SoloVehicleModal from '../components/SoloVehicleModal';
import SoloQualificationsModal from '../components/SoloQualificationsModal';

// --- Hooks & Services ---
import { useWorkTimer } from '../hooks/useWorkTimer';
import { useShiftInfo } from '../hooks/useShiftInfo';
import { useComplianceData } from '../hooks/useComplianceData';

const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// --- HELPER FUNCTIONS ---
const formatDuration = (totalSeconds: number) => {
  if (typeof totalSeconds !== 'number' || isNaN(totalSeconds)) return '00:00:00';
  const absSeconds = Math.abs(totalSeconds);
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  let timeString = '';
  if (days > 0) {
    const paddedDays = String(days).padStart(2, '0');
    timeString = `${paddedDays}d ${paddedHours}h ${paddedMinutes}m`;
  } else {
    timeString = `${paddedHours}h ${paddedMinutes}m`;
  }
  return totalSeconds < 0 ? `- ${timeString}` : timeString;
};
const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '00:00:00';
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  try {
    return (isNegative ? '-' : '') + new Date(absSeconds * 1000).toISOString().substr(11, 8);
  } catch (e) { return '00:00:00'; }
};
const formatShiftTime = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0h 0m';
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const totalMinutes = Math.floor(absSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return (isNegative ? '-' : '') + `${hours}h ${minutes}m`;
};
const formatBreakTime = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '0m';
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes >= 45) return formatShiftTime(seconds);
  const legalBreakMinutes = Math.floor(totalMinutes / 15) * 15;
  return `${legalBreakMinutes}m`;
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between items-center py-1">
    <Text className="text-slate-400 text-sm">{String(label)}</Text>
    <Text className="text-white font-semibold">{String(value)}</Text>
  </View>
);

const ShiftInfoBar = ({ display }: { display: any }) => {
  const { t } = useTranslation();
  const MAX_WEEKLY_DRIVE = 56 * 3600;
  const weeklyUsed = MAX_WEEKLY_DRIVE - (display?.weeklyDrivingRemaining ?? MAX_WEEKLY_DRIVE);
  return (
    <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mt-6 w-full">
      <Text className="text-white font-bold mb-3 text-lg border-b border-slate-700 pb-2">{t('shiftSummary.title')}</Text>
      <Row label={t('shiftSummary.totalWork')} value={formatShiftTime(display?.work ?? 0)} />
      <Row label={t('shiftSummary.totalDriving')} value={formatShiftTime(display?.driving ?? 0)} />
      <Row label={t('shiftSummary.totalBreaks')} value={formatBreakTime(display?.break ?? 0)} />
      <Row label={t('shiftSummary.totalPOA')} value={formatShiftTime(display?.poa ?? 0)} />
      <View className="border-t border-slate-700 mt-2 pt-2">
        <Row label="Weekly Driving Used" value={`${formatShiftTime(weeklyUsed)} / 56h`} />
      </View>
    </View>
  );
};

const ActivityStatusIcon = ({ status, isDriving }: { status: string; isDriving: boolean }) => {
  const iconMap: { [key: string]: React.ReactNode } = {
    break: <Coffee size={28} color="#facc15" />,
    working: <Tool size={28} color="#4ade80" />,
    poa: <User size={28} color="#fb923c" />,
  };
  return (
    <View className="w-16 h-16 rounded-full bg-slate-700 items-center justify-center border-4 border-slate-900 absolute top-[-30px] self-center">
      {isDriving ? <Truck size={28} color="#60a5fa" /> : (iconMap[status] || <Tool size={28} color="#94a3b8" />)}
    </View>
  );
};

const withTimeout = async <T,>(p: Promise<T>, ms = 8000): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
};

export function Dashboard({ session, navigation }: { session: Session; navigation: any }) {
  const { t, i18n, ready } = useTranslation();
  const { profile, refreshProfile } = useAuth();

  if (!session?.user?.id) { return <View className="flex-1 bg-brand-dark justify-center items-center"><ActivityIndicator size="large" color="#F59E0B" /></View>; }
  const userId = session.user.id;

  const { status, sessionId, timerMode, displaySeconds, startWork, endWork, togglePOA, toggleBreak, isDriving, isStarting, shiftSummaryData, setShiftSummaryData } = useWorkTimer(userId, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const display = displaySeconds || { workTimeRemaining: 0, drivingTimeRemaining: 0, spreadoverRemaining: 13 * 3600, breakDuration: 0, work: 0, poa: 0, break: 0, driving: 0, lastBreakDuration: 0, lastBreakEndTime: 0, weeklyDrivingRemaining: 56 * 3600 };
  const driverName = profile?.full_name;
  const payrollNumber = profile?.payroll_number;
  const { previousShiftEnd, currentShiftStart, dailyRest, refreshShiftInfo } = useShiftInfo(userId);
  const [currentComplianceDate, setCurrentComplianceDate] = useState(new Date());
  const { complianceMap, isLoading: isComplianceLoading } = useComplianceData(userId, currentComplianceDate);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [showDriverSetup, setShowDriverSetup] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [showEURules, setShowEURules] = useState(false);
  const [showDigitalTachographGuide, setShowDigitalTachographGuide] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showWorkHistory, setShowWorkHistory] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showSafetyWarning, setShowSafetyWarning] = useState(true);
  const [showBusinessProfile, setShowBusinessProfile] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showVehicleCheck, setShowVehicleCheck] = useState(false);
  const [showSoloVehicle, setShowSoloVehicle] = useState(false);
  const [showQualsModal, setShowQualsModal] = useState(false);
  const [soloVehicle, setSoloVehicle] = useState<any>(null);
  const [vehicleCheckCompletedToday, setVehicleCheckCompletedToday] = useState(false);
  const [dailyReportData, setDailyReportData] = useState<{ violations: string[]; date: string } | null>(null);

  const unreadCheckInFlight = useRef(false);

  const checkUnreadMessages = useCallback(async () => {
    if (unreadCheckInFlight.current || !userId) return;
    unreadCheckInFlight.current = true;

    try {
      const [broadcasts, systemMessages, readRes] = await withTimeout(
        Promise.all([
          getLatestBroadcasts(profile?.company_id),
          getSystemMessages(),
          supabase.from('message_reads').select('message_id').eq('user_id', userId)
        ]),
        8000
      );

      const allMessages = [...broadcasts, ...systemMessages];
      if (allMessages.length === 0) {
        setHasUnreadMessages(false);
        return;
      }

      const readIds = new Set((readRes.data || []).map(r => r.message_id));
      const hasUnread = allMessages.some(m => !readIds.has(m.id));

      setHasUnreadMessages(hasUnread);
    } catch (e) {
      console.log('Unread check skipped:', e instanceof Error ? e.message : 'timeout');
    } finally {
      unreadCheckInFlight.current = false;
    }
  }, [userId, profile?.company_id]);

  const checkVehicleCheckToday = useCallback(async () => {
    if (!userId) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('vehicle_checks')
      .select('id')
      .eq('driver_id', userId)
      .gte('created_at', todayStart.toISOString())
      .limit(1);

    setVehicleCheckCompletedToday(data && data.length > 0);
  }, [userId]);

  const fetchSoloVehicle = useCallback(async () => {
    if (!userId || profile?.account_type !== 'solo') return;
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setSoloVehicle(data);
  }, [userId, profile?.account_type]);

  useEffect(() => {
    const handleAppStateChange = (next: string) => {
      if (next === 'active') {
        setShowSafetyWarning(true);
        setTimeout(() => {
          checkUnreadMessages().catch(() => {});
          checkVehicleCheckToday().catch(() => {});
          fetchSoloVehicle().catch(() => {});
        }, 300);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    checkUnreadMessages();
    checkVehicleCheckToday();
    fetchSoloVehicle();

    return () => sub.remove();
  }, [checkUnreadMessages, checkVehicleCheckToday, fetchSoloVehicle]);

  useEffect(() => {
    if (!userId) return;
    const checkDailyReport = async () => {
      const today = toLocalDateString(new Date());
      const lastLogin = await AsyncStorage.getItem('lastLoginDate');
      if (lastLogin !== today) {
        try {
          const yest = new Date(); yest.setDate(yest.getDate() - 1); const yStr = toLocalDateString(yest);
          const { data } = await supabase.from('work_sessions').select('compliance_violations').eq('user_id', userId).eq('date', yStr);
          if (data?.length) {
            const v = data.flatMap((s) => s.compliance_violations || []);
            if (v.length > 0) setDailyReportData({ violations: [...new Set(v)], date: yStr });
          }
        } finally {
          await AsyncStorage.setItem('lastLoginDate', today);
        }
      }
    };
    checkDailyReport();
  }, [userId]);

  useEffect(() => {
    if (!profile?.company_id) return;
    const channel = supabase
      .channel(`broadcasts:${profile.company_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcasts', filter: `company_id=eq.${profile.company_id}` },
        (payload) => {
          setHasUnreadMessages(true);
          Notifications.scheduleNotificationAsync({
            content: {
              title: t('messages.notificationTitle', 'New Fleet Message'),
              body: (payload.new as any).content,
              sound: 'default',
              channelId: 'messages',
            },
            trigger: null,
          });
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [profile?.company_id, t]);

  useEffect(() => {
    const channel = supabase
      .channel('system_messages_all')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_messages' },
        () => {
          setHasUnreadMessages(true);
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  const dailyCumulativeTotals = useMemo(() => {
    // During an active shift, display already has live totals for today.
    // Only pull from complianceMap for completed historical sessions.
    if (status !== 'idle') {
      return {
        work: display.work,
        break: display.break,
        driving: display.driving,
        poa: display.poa,
      };
    }
    // Shift is idle — show today's completed session totals from DB
    const todayStr = toLocalDateString(new Date());
    const historicalToday = complianceMap.get(todayStr);
    return {
      work: historicalToday?.totalWork || 0,
      break: historicalToday?.totalBreak || 0,
      driving: historicalToday?.totalDrive || 0,
      poa: historicalToday?.totalPoa || 0,
    };
  }, [status, display, complianceMap]);

  const nextSoloComplianceEvent = useMemo(() => {
    if (!soloVehicle) return null;
    const events = [
      { type: 'MOT', date: soloVehicle.mot_due_date },
      { type: 'Service', date: soloVehicle.pmi_due_date },
      { type: 'Tacho', date: soloVehicle.tacho_calibration_due },
      { type: 'Insurance', date: soloVehicle.insurance_expiry },
      { type: 'LOLER', date: soloVehicle.loler_due_date },
    ].filter(e => e.date);

    if (events.length === 0) return null;

    events.sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
    const next = events[0];
    const diff = Math.ceil((new Date(next.date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

    return { ...next, daysRemaining: diff };
  }, [soloVehicle]);

  const qualificationWarnings = useMemo(() => {
    if (!profile) return null;
    const quals = [
      { type: 'Licence', date: profile.driving_licence_expiry },
      { type: 'CPC', date: profile.cpc_dqc_expiry },
      { type: 'Tacho Card', date: profile.tacho_card_expiry },
    ].filter(q => q.date);

    if (quals.length === 0) return null;

    const warnings = quals.map(q => {
      const diff = Math.ceil((new Date(q.date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return { ...q, daysRemaining: diff };
    }).filter(q => q.daysRemaining <= 30);

    if (warnings.length === 0) return null;

    warnings.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return warnings[0];
  }, [profile]);

  if (!userId || !ready) { return <View className="flex-1 bg-brand-dark justify-center items-center"><ActivityIndicator size="large" color="#F59E0B" /></View>; }

  const handleStartWork = async () => {
    if (isStarting) return;
    await startWork();
    refreshShiftInfo();
    await refreshProfile();
  };
  const workLimit = timerMode === '6h' ? 6 * 3600 : 9 * 3600;
  const driveLimit = 4.5 * 3600;
  const spreadoverLimit = 13 * 3600;
  const workPct = Math.min(100, ((workLimit - (display.workTimeRemaining || 0)) / workLimit) * 100);
  const drivePct = Math.min(100, ((driveLimit - (display.drivingTimeRemaining || 0)) / driveLimit) * 100);
  const spreadPct = Math.min(100, ((spreadoverLimit - (display.spreadoverRemaining || 0)) / spreadoverLimit) * 100);

  const handleOpenMessages = () => {
    navigation.navigate('Messages');
    setHasUnreadMessages(false);
  };

  const isFleet = profile?.account_type === 'fleet';
  const isSolo = profile?.account_type === 'solo';

  return (
    <SafeAreaView className="flex-1 bg-brand-dark" edges={['top']}>
      <View className="flex-1">
        {dailyReportData ? <DailyComplianceReportModal visible={!!dailyReportData} onClose={() => setDailyReportData(null)} violations={dailyReportData.violations} date={dailyReportData.date}/> : null}
        {shiftSummaryData ? <EndShiftConfirmationModal visible={!!shiftSummaryData} onClose={() => setShiftSummaryData(null)} onConfirm={shiftSummaryData.onConfirm} violations={shiftSummaryData.violations} shiftTotals={shiftSummaryData.totals} score={shiftSummaryData.score}/> : null}
        <AddExpenseModal visible={showAddExpense} onClose={() => setShowAddExpense(false)} onSaveSuccess={refreshProfile} userId={userId}/>
        <BusinessProfileModal visible={showBusinessProfile} onClose={() => setShowBusinessProfile(false)} />
        <Modal visible={showSafetyWarning} transparent animationType="fade"><SafetyWarningModal onClose={() => setShowSafetyWarning(false)} /></Modal>
        <Modal visible={showDriverSetup} animationType="slide" onRequestClose={() => setShowDriverSetup(false)}><DriverSetup session={session} onClose={() => setShowDriverSetup(false)} /></Modal>
        <Instructions visible={showInstructions} onClose={() => setShowInstructions(false)} />
        <PrivacyInfo visible={showPrivacyInfo} onClose={() => setShowPrivacyInfo(false)} />
        <EUWorkingTimeRules visible={showEURules} onClose={() => setShowEURules(false)} />
        <DigitalTachographGuide visible={showDigitalTachographGuide} onClose={() => setShowDigitalTachographGuide(false)} />
        <DownloadReportModal visible={showReportModal} onClose={() => setShowReportModal(false)} />
        <LanguageSelector visible={showLanguageSelector} onClose={() => setShowLanguageSelector(false)} onSelectLanguage={(l) => i18n.changeLanguage(l)} currentLanguage={i18n.language}/>
        <Modal visible={showCompliance} transparent animationType="slide"><ComplianceHeatmap onClose={() => setShowCompliance(false)} complianceMap={complianceMap} isLoading={isComplianceLoading} currentDate={currentComplianceDate} setCurrentDate={setCurrentComplianceDate}/></Modal>
        <Modal visible={showWorkHistory} animationType="slide"><CalendarView timezone={Intl.DateTimeFormat().resolvedOptions().timeZone} userId={userId} onClose={() => setShowWorkHistory(false)} onDataChanged={refreshProfile}/></Modal>
        <VehicleChecklistModal
            visible={showVehicleCheck}
            onClose={() => setShowVehicleCheck(false)}
            userId={userId}
            profile={profile}
            sessionId={sessionId}
            onSuccess={() => setVehicleCheckCompletedToday(true)}
        />
        <SoloVehicleModal visible={showSoloVehicle} onClose={() => { setShowSoloVehicle(false); fetchSoloVehicle(); }} userId={userId} />
        <SoloQualificationsModal visible={showQualsModal} onClose={() => { setShowQualsModal(false); refreshProfile(); }} userId={userId} />

        <Modal visible={showMenu} transparent animationType="fade">
          <TouchableOpacity className="flex-1" onPress={() => setShowMenu(false)}>
            <View className="absolute top-20 left-4 bg-slate-800 rounded-lg shadow-xl py-2 w-60 border border-slate-700">
              {[
                { label: 'menu.instructions', icon: <Book size={18} color="white" />, action: () => setShowInstructions(true) },
                { label: 'menu.privacyInfo', icon: <Shield size={18} color="white" />, action: () => setShowPrivacyInfo(true) },
                { label: 'menu.euWorkingTimeRules', icon: <Globe size={18} color="white" />, action: () => setShowEURules(true) },
                { label: 'menu.tachoGuide', icon: <FileText size={18} color="white" />, action: () => setShowDigitalTachographGuide(true) },
                { label: 'menu.compliance', icon: <AlertTriangle size={18} color="white" />, action: () => setShowCompliance(true) },
                { label: 'menu.workHistory', icon: <Calendar size={18} color="white" />, action: () => setShowWorkHistory(true) },
                { label: 'menu.addExpense', icon: <DollarSign size={18} color="white" />, action: () => setShowAddExpense(true) },
                { label: 'menu.downloadReport', icon: <Download size={18} color="white" />, action: () => setShowReportModal(true) }
              ].map((item, idx) => ( <TouchableOpacity key={idx} onPress={() => { item.action(); setShowMenu(false); }} className="px-4 py-3 flex-row items-center gap-3">{item.icon}<Text className="text-white">{t(item.label)}</Text></TouchableOpacity> ))}
            </View>
          </TouchableOpacity>
        </Modal>

        <View className="px-4 py-3 flex-row items-center justify-center relative bg-brand-accent shadow-lg">
            <View className="absolute left-4 top-3">
                <TouchableOpacity onPress={() => setShowMenu(true)} className="p-2">
                    <Menu size={24} color="white" />
                </TouchableOpacity>
            </View>
            <Text className="text-xl font-bold text-slate-50">{t('app.title')}</Text>
            <View className="absolute right-4 top-3 flex-row items-center">
                <TouchableOpacity onPress={handleOpenMessages} className="p-2 relative">
                    <Bell size={24} color="white" />
                    {hasUnreadMessages && ( <View className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-brand-accent" /> )}
                </TouchableOpacity>
                <SettingsMenu
                  onOpenDriverSetup={() => setShowDriverSetup(true)}
                  onOpenLanguageSelector={() => setShowLanguageSelector(true)}
                  onOpenBusinessProfile={() => setShowBusinessProfile(true)}
                  onOpenSubscription={() => navigation.navigate('Subscription')}
                  onOpenVehicleSettings={() => setShowSoloVehicle(true)}
                />
            </View>
        </View>

        <ScrollView className="flex-1">
          <View className="px-4 py-8 max-w-md mx-auto w-full">
            <View className="items-center mb-6">
                <Text className="text-slate-400 text-base font-medium mb-2">{t('app.subtitle')}</Text>
                <View className="flex-row items-center gap-2">
                    {driverName && <Text className="text-lg font-semibold text-compliance-info">{driverName}</Text>}
                    <TouchableOpacity
                        onPress={() => setShowVehicleCheck(true)}
                        className={`px-3 py-1.5 rounded-full flex-row items-center gap-1.5 ${vehicleCheckCompletedToday ? 'bg-green-600/20 border border-green-500/50' : isFleet ? 'bg-red-600 border border-red-500' : 'bg-slate-700/50 border border-slate-600'}`}
                    >
                        {vehicleCheckCompletedToday ? <CheckCircle size={14} color="#22c55e" /> : <AlertTriangle size={14} color={isFleet ? "white" : "#94a3b8"} />}
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: vehicleCheckCompletedToday ? '#22c55e' : 'white' }}>
                            {vehicleCheckCompletedToday ? 'Check OK' : 'Check Vehicle'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {qualificationWarnings && (
              <TouchableOpacity
                onPress={() => setShowQualsModal(true)}
                className={`mb-6 p-4 rounded-2xl border flex-row items-center justify-between ${qualificationWarnings.daysRemaining <= 0 ? 'bg-red-500/10 border-red-500/50' : 'bg-amber-500/10 border-amber-500/50'}`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-10 h-10 rounded-full items-center justify-center ${qualificationWarnings.daysRemaining <= 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
                    <Shield size={20} color="white" />
                  </View>
                  <View>
                    <Text className="text-white font-bold">
                      {qualificationWarnings.daysRemaining <= 0 ? `${qualificationWarnings.type} Expired` : `${qualificationWarnings.type} Expiring`}
                    </Text>
                    <Text className="text-slate-400 text-xs">{qualificationWarnings.date}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className={`text-xl font-black ${qualificationWarnings.daysRemaining <= 0 ? 'text-red-500' : 'text-amber-500'}`}>
                    {Math.max(0, qualificationWarnings.daysRemaining)}
                  </Text>
                  <Text className="text-[10px] text-slate-500 font-bold uppercase">Days Left</Text>
                </View>
              </TouchableOpacity>
            )}

            {isSolo && nextSoloComplianceEvent && (
              <TouchableOpacity
                onPress={() => setShowSoloVehicle(true)}
                className={`mb-6 p-4 rounded-2xl border flex-row items-center justify-between ${nextSoloComplianceEvent.daysRemaining < 7 ? 'bg-red-500/10 border-red-500/50' : nextSoloComplianceEvent.daysRemaining < 21 ? 'bg-amber-500/10 border-amber-500/50' : 'bg-slate-800/50 border-slate-700'}`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-10 h-10 rounded-full items-center justify-center ${nextSoloComplianceEvent.daysRemaining < 7 ? 'bg-red-500' : nextSoloComplianceEvent.daysRemaining < 21 ? 'bg-amber-500' : 'bg-blue-500'}`}>
                    <Clock size={20} color="white" />
                  </View>
                  <View>
                    <Text className="text-white font-bold">{nextSoloComplianceEvent.type} Due</Text>
                    <Text className="text-slate-400 text-xs">{nextSoloComplianceEvent.date}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className={`text-xl font-black ${nextSoloComplianceEvent.daysRemaining < 7 ? 'text-red-500' : nextSoloComplianceEvent.daysRemaining < 21 ? 'text-amber-500' : 'text-blue-400'}`}>
                    {Math.max(0, nextSoloComplianceEvent.daysRemaining)}
                  </Text>
                  <Text className="text-[10px] text-slate-500 font-bold uppercase">Days Left</Text>
                </View>
              </TouchableOpacity>
            )}

            <View className="bg-brand-card rounded-lg p-4 mb-4 border border-brand-border">
                {previousShiftEnd ? ( <Row label={t('dashboard.previousShiftEnd')} value={new Date(previousShiftEnd).toLocaleString(i18n.language, { hour12: false, dateStyle: 'short', timeStyle: 'short' })} /> ) : null}
                {currentShiftStart ? ( <Row label={t('dashboard.newShiftStarted')} value={new Date(currentShiftStart).toLocaleString(i18n.language, { hour12: false, dateStyle: 'short', timeStyle: 'short' })} /> ) : null}
                {dailyRest > 0 ? (<View className="mt-2 pt-2 border-t border-slate-700 flex-row justify-between"><Text className="text-slate-400">{t('dashboard.dailyRest')}</Text><Text className="text-white font-bold">{formatDuration(dailyRest)}</Text></View>) : null}
                {payrollNumber ? ( <Row label={'Payroll Number'} value={payrollNumber} /> ) : null}
            </View>
            <FatigueMonitor
              workSeconds={dailyCumulativeTotals.work}
              breakSeconds={dailyCumulativeTotals.break}
              dailyRestSeconds={dailyRest}
              drivingSeconds={dailyCumulativeTotals.driving}
              workTimeRemaining={display.workTimeRemaining}
            />
            <View className="bg-brand-card rounded-2xl p-4 mb-6 relative pt-10 border border-brand-border">
              {status !== 'idle' ? <ActivityStatusIcon status={status} isDriving={isDriving} /> : null}
              <DigitalClock />
              <View className="mt-6 items-center">
                {status === 'break' ? ( <View className="items-center mb-4"><Text className="text-5xl font-bold text-compliance-warning">{formatTime(display.breakDuration)}</Text><Text className="text-slate-400">{t('dashboard.breakDuration')}</Text></View>
                ) : display.lastBreakDuration > 0 && display.lastBreakEndTime > 0 ? (
                  <View className="items-center mb-4"><Text className="text-lg font-semibold text-slate-300">Last break: {formatTime(display.lastBreakDuration)}</Text></View>
                ) : status !== 'idle' ? (
                  <><View className="w-full mb-4 items-center">
                    <Text className="w-full text-slate-400 text-xs font-bold uppercase mb-2">{t('dashboard.workTimeRemaining')}</Text>
                    <Text className={`text-5xl font-bold ${display.workTimeRemaining < 0 ? 'text-compliance-danger' : 'text-white'}`}>{formatTime(display.workTimeRemaining)}</Text>
                    <View className="w-full h-2 bg-brand-dark rounded-full mt-2 overflow-hidden"><View className={`h-full ${display.workTimeRemaining < 0 ? 'bg-compliance-danger' : 'bg-compliance-success'}`} style={{ width: `${workPct}%` }} /></View>
                  </View>
                  <View className="w-full mb-4 items-center">
                    <Text className="w-full text-slate-400 text-xs font-bold uppercase mb-2">{t('dashboard.drivingTimeRemaining')}</Text>
                    <Text className={`text-5xl font-bold ${display.drivingTimeRemaining < 0 ? 'text-compliance-danger' : 'text-white'}`}>{formatTime(display.drivingTimeRemaining)}</Text>
                    <View className="w-full h-2 bg-brand-dark rounded-full mt-2 overflow-hidden"><View className={`h-full ${display.drivingTimeRemaining < 0 ? 'bg-compliance-danger' : 'bg-brand-accent'}`} style={{ width: `${drivePct}%` }} /></View>
                  </View>
                  {display.spreadoverRemaining < 3 * 3600 && (
                    <View className="w-full mb-4 items-center">
                      <Text className="w-full text-slate-400 text-xs font-bold uppercase mb-2">Spreadover Remaining</Text>
                      <Text className={`text-5xl font-bold ${display.spreadoverRemaining < 0 ? 'text-compliance-danger' : 'text-amber-400'}`}>{formatTime(display.spreadoverRemaining)}</Text>
                      <View className="w-full h-2 bg-brand-dark rounded-full mt-2 overflow-hidden"><View className={`h-full ${display.spreadoverRemaining < 0 ? 'bg-compliance-danger' : 'bg-amber-500'}`} style={{ width: `${spreadPct}%` }} /></View>
                    </View>
                  )}
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={handleStartWork}
                    disabled={isStarting}
                    className={`w-full py-4 rounded-xl bg-brand-accent my-4 flex-row justify-center items-center ${isStarting ? 'opacity-70' : ''}`}
                  >
                    {isStarting && <ActivityIndicator color="white" style={{ marginRight: 10 }} />}
                    <Text className="text-white font-bold text-xl text-center uppercase">
                      {isStarting ? t('common.loading', 'Starting...') : t('dashboard.startShift')}
                    </Text>
                  </TouchableOpacity>
                )}
                {status !== 'idle' ? ( <View className="w-full">
                    {/* TODO: Navigate to ShiftJobsScreen before EndShiftConfirmationModal to capture per-job mileage, waiting time and night out data for invoice generation. */}
                    <TouchableOpacity onPress={toggleBreak} disabled={isDriving} className={`py-3 rounded-lg mb-3 items-center ${status === 'break' ? 'bg-yellow-500' : 'bg-blue-600'} ${isDriving ? 'opacity-30' : ''}`}><Text className={`font-bold text-lg uppercase ${status === 'break' ? 'text-black' : 'text-white'}`}>{status === 'break' ? t('dashboard.endBreak') : t('dashboard.startBreak')}</Text></TouchableOpacity><TouchableOpacity onPress={togglePOA} disabled={status === 'break' || isDriving} className={`py-3 rounded-lg mb-3 items-center border-2 ${status === 'poa' ? 'bg-orange-400' : 'bg-brand-accent'} ${isDriving ? 'opacity-30' : ''}`}><Text className="text-white font-bold text-lg uppercase">{status === 'poa' ? t('dashboard.resumeWork') : t('dashboard.poaButtonText')}</Text></TouchableOpacity><TouchableOpacity onPress={endWork} disabled={isDriving} className="py-4 rounded-xl bg-compliance-danger mt-4"><Text className="text-white font-bold text-xl text-center uppercase">{t('dashboard.endShift')}</Text></TouchableOpacity>
                    {isDriving && <Text className="text-red-400 text-xs text-center mt-2 font-bold uppercase">Stop vehicle before ending shift</Text>}
                    </View> ) : null}
              </View>
              {status !== 'idle' ? <ShiftInfoBar display={display} /> : null}
            </View>
            <ComplianceHeatmapSummary onPress={() => setShowCompliance(true)} complianceMap={complianceMap} isLoading={isComplianceLoading} currentDate={currentComplianceDate} />
                    </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export default Dashboard;
