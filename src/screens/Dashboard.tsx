import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Modal,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  AppState,
  Platform,
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

// --- Hooks & Services ---
import { useWorkTimer } from '../hooks/useWorkTimer';
import { useShiftInfo } from '../hooks/useShiftInfo';
import { useComplianceData } from '../hooks/useComplianceData';
import { usePermissions } from '../hooks/usePermissions';

const toLocalDateString = (date: Date) => date.toISOString().split('T')[0];
const LAST_VIEWED_MESSAGES_KEY = 'lastViewedMessagesTimestamp';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// --- HELPER FUNCTIONS (assumed to be correct, no changes needed) ---
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
// --- END HELPER FUNCTIONS ---


const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between items-center py-1">
    <Text className="text-slate-400 text-sm">{String(label)}</Text>
    <Text className="text-white font-semibold">{String(value)}</Text>
  </View>
);

const ShiftInfoBar = ({ display }: { display: any }) => {
  const { t } = useTranslation();
  return (
    <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mt-6 w-full">
      <Text className="text-white font-bold mb-3 text-lg border-b border-slate-700 pb-2">{t('shiftSummary.title')}</Text>
      <Row label={t('shiftSummary.totalWork')} value={formatShiftTime(display?.work ?? 0)} />
      <Row label={t('shiftSummary.totalDriving')} value={formatShiftTime(display?.driving ?? 0)} />
      <Row label={t('shiftSummary.totalBreaks')} value={formatBreakTime(display?.break ?? 0)} />
      <Row label={t('shiftSummary.totalPOA')} value={formatShiftTime(display?.poa ?? 0)} />
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

export function Dashboard({ session, navigation }: { session: Session; navigation: any }) {
  const { t, i18n, ready } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  // Initialize permissions hook to ensure channel is created
  usePermissions();


  if (!session?.user?.id) { return <View className="flex-1 bg-brand-dark justify-center items-center"><ActivityIndicator size="large" color="#F59E0B" /></View>; }
  const userId = session.user.id;

  const { status, timerMode, displaySeconds, startWork, endWork, togglePOA, toggleBreak, isDriving, shiftSummaryData, setShiftSummaryData } = useWorkTimer(userId, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const display = displaySeconds || { workTimeRemaining: 0, drivingTimeRemaining: 0, breakDuration: 0, work: 0, poa: 0, break: 0, driving: 0 };
  const driverName = profile?.full_name;
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
  const [dailyReportData, setDailyReportData] = useState<{ violations: string[]; date: string } | null>(null);

  useEffect(() => {
    const checkUnreadMessages = async () => {
        const [broadcasts, systemMessages] = await Promise.all([
            getLatestBroadcasts(),
            getSystemMessages(),
        ]);
        const allMessages = [...broadcasts, ...systemMessages];
        if (allMessages.length > 0) {
            allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const lastViewed = await AsyncStorage.getItem(LAST_VIEWED_MESSAGES_KEY);
            const latestTimestamp = new Date(allMessages[0].created_at).getTime();
            if (!lastViewed || latestTimestamp > parseInt(lastViewed, 10)) {
                setHasUnreadMessages(true);
            }
        }
    };
    const handleAppStateChange = (next: string) => {
      if (next === 'active') {
        setShowSafetyWarning(true);
        checkUnreadMessages();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    checkUnreadMessages();
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const checkDailyReport = async () => {
      const today = toLocalDateString(new Date());
      const lastLogin = await AsyncStorage.getItem('lastLoginDate');
      if (lastLogin !== today) {
        const yest = new Date(); yest.setDate(yest.getDate() - 1); const yStr = toLocalDateString(yest);
        const { data } = await supabase.from('work_sessions').select('compliance_violations').eq('user_id', userId).eq('date', yStr);
        if (data?.length) {
          const v = data.flatMap((s) => s.compliance_violations || []);
          if (v.length > 0) setDailyReportData({ violations: [...new Set(v)], date: yStr });
        }
        await AsyncStorage.setItem('lastLoginDate', today);
      }
    };
    checkDailyReport();
  }, [userId]);

  useEffect(() => {
    if (!profile?.company_id) return;
    const channel = supabase.channel(`broadcasts:${profile.company_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts', filter: `company_id=eq.${profile.company_id}`},
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
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.company_id, t]);

  // Real-time listener for system messages
  useEffect(() => {
    const channel = supabase.channel('system_messages_all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_messages' },
        (payload) => {
          setHasUnreadMessages(true);
          Notifications.scheduleNotificationAsync({
            content: {
              title: t('messages.systemNotificationTitle', 'System Announcement'),
              body: (payload.new as any).content,
              sound: 'default',
              channelId: 'messages',
            },
            trigger: null,
          });
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [t]);

  if (!userId || !ready) { return <View className="flex-1 bg-brand-dark justify-center items-center"><ActivityIndicator size="large" color="#F59E0B" /></View>; }

  const handleStartWork = async () => { await startWork(); refreshShiftInfo(); await refreshProfile(); };
  const workLimit = timerMode === '6h' ? 6 * 3600 : 9 * 3600;
  const driveLimit = 4.5 * 3600;
  const workPct = Math.min(100, ((workLimit - (display.workTimeRemaining || 0)) / workLimit) * 100);
  const drivePct = Math.min(100, ((driveLimit - (display.drivingTimeRemaining || 0)) / driveLimit) * 100);

  const handleOpenMessages = async () => {
    navigation.navigate('Messages');
    await AsyncStorage.setItem(LAST_VIEWED_MESSAGES_KEY, Date.now().toString());
    setHasUnreadMessages(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-dark" edges={['top']}>
      <View className="flex-1">
        {/* Modals */}
        {dailyReportData && <DailyComplianceReportModal visible={!!dailyReportData} onClose={() => setDailyReportData(null)} violations={dailyReportData.violations} date={dailyReportData.date}/>}
        {shiftSummaryData && <EndShiftConfirmationModal visible={!!shiftSummaryData} onClose={() => setShiftSummaryData(null)} onConfirm={shiftSummaryData.onConfirm} violations={shiftSummaryData.violations} shiftTotals={shiftSummaryData.totals}/>}
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
                    {hasUnreadMessages && (
                        <View className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-brand-accent" />
                    )}
                </TouchableOpacity>
                <SettingsMenu onOpenDriverSetup={() => setShowDriverSetup(true)} onOpenLanguageSelector={() => setShowLanguageSelector(true)} onOpenBusinessProfile={() => setShowBusinessProfile(true)} onOpenSubscription={() => navigation.navigate('Subscription')} />
            </View>
        </View>

        <ScrollView className="flex-1">
          <View className="px-4 py-8 max-w-md mx-auto w-full">
            <View className="items-center mb-6"><Text className="text-slate-400 text-base font-medium mb-2">{t('app.subtitle')}</Text>{driverName && <Text className="text-lg font-semibold text-compliance-info">{driverName}</Text>}</View>
            <View className="bg-brand-card rounded-lg p-4 mb-4 border border-brand-border">{previousShiftEnd && ( <Row label={t('dashboard.previousShiftEnd')} value={new Date(previousShiftEnd).toLocaleString(i18n.language, { hour12: false, dateStyle: 'short', timeStyle: 'short' })} /> )}{currentShiftStart && ( <Row label={t('dashboard.newShiftStarted')} value={new Date(currentShiftStart).toLocaleString(i18n.language, { hour12: false, dateStyle: 'short', timeStyle: 'short' })} /> )}{dailyRest > 0 && (<View className="mt-2 pt-2 border-t border-slate-700 flex-row justify-between"><Text className="text-slate-400">{t('dashboard.dailyRest')}</Text><Text className="text-white font-bold">{formatDuration(dailyRest)}</Text></View>)}</View>
            <FatigueMonitor workSeconds={display.work || 0} breakSeconds={display.break || 0} dailyRestSeconds={dailyRest} drivingSeconds={display.driving || 0} workTimeRemaining={display.workTimeRemaining}/>
            <View className="bg-brand-card rounded-2xl p-4 mb-6 relative pt-10 border border-brand-border">
              {status !== 'idle' && <ActivityStatusIcon status={status} isDriving={isDriving} />}
              <DigitalClock />
              <View className="mt-6 items-center">
                {status === 'break' ? ( <View className="items-center mb-4"><Text className="text-5xl font-bold text-compliance-warning">{formatTime(display.breakDuration)}</Text><Text className="text-slate-400">{t('dashboard.breakDuration')}</Text></View>
                ) : status !== 'idle' ? (
                  <><View className="w-full mb-4 items-center">
                    <Text className="w-full text-slate-400 text-xs font-bold uppercase mb-2">{t('dashboard.workTimeRemaining')}</Text>
                    <Text className={`text-5xl font-bold ${display.workTimeRemaining < 0 ? 'text-compliance-danger' : 'text-white'}`}>{formatTime(display.workTimeRemaining)}</Text>
                    <View className="w-full h-2 bg-brand-dark rounded-full mt-2 overflow-hidden"><View className={display.workTimeRemaining < 0 ? 'bg-compliance-danger' : 'bg-compliance-success'} style={{ width: `${workPct}%` }} /></View>
                  </View>
                  <View className="w-full mb-4 items-center">
                    <Text className="w-full text-slate-400 text-xs font-bold uppercase mb-2">{t('dashboard.drivingTimeRemaining')}</Text>
                    <Text className={`text-5xl font-bold ${display.drivingTimeRemaining < 0 ? 'text-compliance-danger' : 'text-white'}`}>{formatTime(display.drivingTimeRemaining)}</Text>
                    <View className="w-full h-2 bg-brand-dark rounded-full mt-2 overflow-hidden"><View className={display.drivingTimeRemaining < 0 ? 'bg-compliance-danger' : 'bg-brand-accent'} style={{ width: `${drivePct}%` }} /></View>
                  </View></>
                ) : ( <TouchableOpacity onPress={handleStartWork} className="w-full py-4 rounded-xl bg-brand-accent my-4"><Text className="text-white font-bold text-xl text-center uppercase">{t('dashboard.startShift')}</Text></TouchableOpacity> )}
                {status !== 'idle' && ( <View className="w-full"><TouchableOpacity onPress={toggleBreak} disabled={isDriving} className={`py-3 rounded-lg mb-3 items-center ${status === 'break' ? 'bg-yellow-500' : 'bg-blue-600'} ${isDriving ? 'opacity-30' : ''}`}><Text className={`font-bold text-lg uppercase ${status === 'break' ? 'text-black' : 'text-white'}`}>{status === 'break' ? t('dashboard.endBreak') : t('dashboard.startBreak')}</Text></TouchableOpacity><TouchableOpacity onPress={togglePOA} disabled={status === 'break' || isDriving} className={`py-3 rounded-lg mb-3 items-center border-2 ${status === 'poa' ? 'bg-orange-400' : 'bg-brand-accent'} ${isDriving ? 'opacity-30' : ''}`}><Text className="text-white font-bold text-lg uppercase">{status === 'poa' ? t('dashboard.resumeWork') : t('dashboard.poaButtonText')}</Text></TouchableOpacity><TouchableOpacity onPress={endWork} disabled={isDriving} className="py-4 rounded-xl bg-compliance-danger mt-4"><Text className="text-white font-bold text-xl text-center uppercase">{t('dashboard.endShift')}</Text></TouchableOpacity></View> )}
              </View>
              {status !== 'idle' && <ShiftInfoBar display={display} />}
            </View>
            <ComplianceHeatmapSummary onPress={() => setShowCompliance(true)} complianceMap={complianceMap} isLoading={isComplianceLoading} currentDate={currentComplianceDate} />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
export default Dashboard;
