import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, ScrollView, Modal, TouchableOpacity, Text, Dimensions, AppState } from 'react-native';
import { Menu, Play, Pause, BookOpen, Scale, FileText, AlertCircle, Calendar, Download } from 'lucide-react-native';
import { Session } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';

// --- Components ---
import { DigitalClock } from '../components/DigitalClock';
import { FatigueMonitor } from '../components/FatigueMonitor';
import DriverSetup from '../components/DriverSetup';
import SettingsMenu from '../components/SettingsMenu';
import Instructions from '../components/Instructions';
import PrivacyInfo from '../components/PrivacyInfo';
import EUWorkingTimeRules from '../components/EUWorkingTimeRules';
import DigitalTachographGuide from '../components/DigitalTachographGuide';
import ComplianceHeatmap from '../components/ComplianceHeatmap';
import CalendarView from '../components/CalendarView';
import DownloadReportModal from '../components/DownloadReportModal';
import LanguageSelector from '../components/LanguageSelector';
import SafetyWarningModal from '../components/SafetyWarningModal';

// --- Hooks & Services ---
import { useWorkTimer } from '../hooks/useWorkTimer';
import { useDriverStats } from '../hooks/useDriverStats';

const { width } = Dimensions.get('window');

const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
    return '00:00:00';
  }
  try {
    return new Date(seconds * 1000).toISOString().substr(11, 8);
  } catch (e) {
    return '00:00:00';
  }
};

const WeeklySummary = ({ current, previous, t }: { current: number, previous: number, t: any }) => (
  <View className="bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
    <Text className="text-lg font-semibold text-white mb-4">{t('weeklyHoursSummary')}</Text>
    <View className="flex-row gap-4">
      <View className="flex-1 bg-slate-900 rounded-lg p-4">
        <Text className="text-slate-400 text-sm mb-1">{t('previousWeek')}</Text>
        <Text className="text-2xl font-bold text-white">{previous.toFixed(1)}h</Text>
      </View>
      <View className="flex-1 bg-slate-900 rounded-lg p-4">
        <Text className="text-slate-400 text-sm mb-1">{t('currentWeek')}</Text>
        <Text className="text-2xl font-bold text-blue-400">{current.toFixed(1)}h</Text>
      </View>
    </View>
  </View>
);

export function Dashboard({ session }: { session: Session }) {
  const { t, i18n } = useTranslation();
  const { status, timerMode, workStartTime, displaySeconds, startWork, endWork, togglePOA, toggleBreak, restoreState } = useWorkTimer(session.user.id, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const { driverName, previousShiftEnd, weeklyHours, previousWeekHours, refreshStats, needsSetup } = useDriverStats(session.user.id);

  // --- UI State ---
  const [showMenu, setShowMenu] = useState(false);
  const [showDriverSetup, setShowDriverSetup] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [showEURules, setShowEURules] = useState(false);
  const [showDigitalTachoGuide, setShowDigitalTachoGuide] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showWorkHistory, setShowWorkHistory] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showSafetyWarning, setShowSafetyWarning] = useState(true);

  // --- Effects ---
  useEffect(() => {
    restoreState();
  }, [restoreState]);

  useEffect(() => {
    if (needsSetup) {
      setShowDriverSetup(true);
    }
  }, [needsSetup]);

  const dailyRest = useMemo(() => {
    if (!previousShiftEnd || !workStartTime) return null;
    const start = new Date(workStartTime).getTime();
    const end = new Date(previousShiftEnd).getTime();
    if (isNaN(start) || isNaN(end)) return null;
    return Math.floor((start - end) / 1000);
  }, [previousShiftEnd, workStartTime]);

  return (
    <View className="flex-1 bg-slate-900 pt-10">

      {/* --- NEW HEADER / TASKBAR --- */}
      <View className="px-4 py-3 flex-row items-center justify-between bg-[#ff6f00] shadow-lg">
        {/* Left: Menu Button */}
        <TouchableOpacity onPress={() => setShowMenu(true)} className="p-2">
          <Menu size={24} color="white" />
        </TouchableOpacity>

        {/* Center: App Title */}
        <Text className="text-xl font-bold text-white">{t('appTitle')}</Text>

        {/* Right: Settings Menu */}
        <SettingsMenu
          onOpenDriverSetup={() => setShowDriverSetup(true)}
          onOpenLanguageSelector={() => setShowLanguageSelector(true)}
        />
      </View>

      <ScrollView className="flex-1">
        <View className="px-4 py-8 max-w-md mx-auto w-full">

          {/* --- Modals --- */}
          <Modal visible={showSafetyWarning} transparent animationType="fade" onRequestClose={() => setShowSafetyWarning(false)}>
            <SafetyWarningModal onClose={() => setShowSafetyWarning(false)} t={t} />
          </Modal>
          <DriverSetup isOpen={showDriverSetup} onClose={() => setShowDriverSetup(false)} onSave={refreshStats} session={session} />
          <Instructions visible={showInstructions} onClose={() => setShowInstructions(false)} t={t} />
          <PrivacyInfo visible={showPrivacyInfo} onClose={() => setShowPrivacyInfo(false)} t={t} />
          <EUWorkingTimeRules visible={showEURules} onClose={() => setShowEURules(false)} t={t} />
          <DigitalTachographGuide visible={showDigitalTachoGuide} onClose={() => setShowDigitalTachoGuide(false)} t={t} />
          <Modal visible={showCompliance} transparent animationType="slide" onRequestClose={() => setShowCompliance(false)}>
            <ComplianceHeatmap timezone={Intl.DateTimeFormat().resolvedOptions().timeZone} onClose={() => setShowCompliance(false)} t={t} />
          </Modal>
          <Modal visible={showWorkHistory} transparent animationType="slide" onRequestClose={() => setShowWorkHistory(false)}>
            <CalendarView
              timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
              weeklyHours={weeklyHours}
              previousWeekHours={previousWeekHours}
              last7DaysHours={0}
              t={t}
              userId={session.user.id}
              onClose={() => setShowWorkHistory(false)}
              onDataChanged={refreshStats}
            />
          </Modal>
          <DownloadReportModal visible={showReportModal} onClose={() => setShowReportModal(false)} t={t} />
          <LanguageSelector
            visible={showLanguageSelector}
            onClose={() => setShowLanguageSelector(false)}
            onSelectLanguage={(lang) => i18n.changeLanguage(lang)}
            currentLanguage={i18n.language}
          />
          <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
            <TouchableOpacity className="flex-1" activeOpacity={1} onPressOut={() => setShowMenu(false)}>
              <View className="absolute top-20 left-4 bg-slate-800 rounded-lg shadow-xl py-2 w-60 z-50 border border-slate-700">
                <TouchableOpacity onPress={() => { setShowInstructions(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <BookOpen size={18} color="white" />
                  <Text className="text-white">{t('instructions')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowPrivacyInfo(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <BookOpen size={18} color="white" />
                  <Text className="text-white">{t('privacyInfo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowEURules(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <Scale size={18} color="white" />
                  <Text className="text-white">{t('euWorkingTimeRules')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowDigitalTachoGuide(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <FileText size={18} color="white" />
                  <Text className="text-white">{t('tachoGuide')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowCompliance(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <AlertCircle size={18} color="white" />
                  <Text className="text-white">{t('compliance')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowWorkHistory(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <Calendar size={18} color="white" />
                  <Text className="text-white">{t('workHistory')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowReportModal(true); setShowMenu(false); }} className="w-full px-4 py-3 flex-row items-center gap-3">
                  <Download size={18} color="white" />
                  <Text className="text-white">{t('downloadReport')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* --- Main Content (Subtitle and Driver Name) --- */}
          <View className="items-center mb-6">
            <Text className="text-slate-400 text-base font-medium mb-2">{t('appSubtitle')}</Text>
            {driverName && <Text className="text-lg font-semibold text-blue-400">{driverName}</Text>}
          </View>

          {/* --- Shift Info Card --- */}
          {previousShiftEnd && (
            <View className="bg-slate-800 rounded-lg p-4 mb-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-xs text-slate-400">{t('previousShiftEnd')}</Text>
                <Text className="text-xs font-semibold text-white">
                  {new Date(previousShiftEnd).toLocaleString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {workStartTime && (
                <View className="flex-row justify-between items-center mt-1">
                  <Text className="text-xs text-slate-400">{t('newShiftStarted')}</Text>
                  <Text className="text-xs font-semibold text-white">
                    {new Date(workStartTime).toLocaleString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
              {dailyRest !== null && (
                <View className="flex-row justify-between items-center mt-1">
                  <Text className="text-xs text-slate-400">{t('dailyRestPeriod')}</Text>
                  <Text className="text-xs font-semibold text-white">{formatTime(dailyRest)}</Text>
                </View>
              )}
            </View>
          )}

          {/* --- Main Controller & Timer --- */}
          <View className="bg-slate-800 rounded-2xl p-4 mb-6">
            <DigitalClock />
            {status !== 'idle' && (
              <FatigueMonitor
                workSeconds={displaySeconds.work}
                breakSeconds={displaySeconds.break}
                dailyRestSeconds={dailyRest}
              />
            )}
            <View className="mt-6 items-center">
              <Text className={`text-5xl font-bold mb-1 ${status === 'break' ? 'text-yellow-400' : 'text-white'}`}>
                {status === 'break'
                  ? formatTime(displaySeconds.breakDuration)
                  : formatTime(displaySeconds.workTimeRemaining)}
              </Text>
              <Text className="text-gray-300 mb-6 font-medium">
                {status === 'break' ? t('breakDuration') : t('drivingTimeRemaining')}
              </Text>

              {status === 'idle' && (
                <TouchableOpacity onPress={startWork} className="w-full py-4 rounded-xl shadow-sm mb-6 bg-green-600">
                  <Text className="text-white font-bold text-xl text-center uppercase tracking-wider">{t('startShift')}</Text>
                </TouchableOpacity>
              )}

              {status !== 'idle' && (
                <View className="w-full">
                  <TouchableOpacity
                    onPress={toggleBreak}
                    className={`w-full py-3 rounded-lg items-center border-2 mb-4 ${
                      status === 'break' ? 'bg-yellow-500 border-yellow-500' : 'bg-transparent border-blue-600'
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className={`font-bold text-lg ${status === 'break' ? 'text-black' : 'text-white'}`}>
                        {status === 'break' ? t('endBreak') : t('startBreak')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={togglePOA}
                    disabled={status === 'break'}
                    className={`w-full py-3 rounded-lg items-center border-2 mb-4 ${status === 'poa' ? 'bg-yellow-500 border-yellow-500' : 'bg-transparent border-slate-600'} ${status === 'break' ? 'opacity-30' : 'opacity-100'}`}
                  >
                    <View className="flex-row items-center gap-2">
                      {status === 'poa' ? <Play size={20} color="black" /> : <Pause size={20} color="white" />}
                      <Text className={`font-bold text-lg ${status === 'poa' ? 'text-black' : 'text-white'}`}>
                        {status === 'poa' ? t('resumeDriving') : t('poaButtonText')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={endWork} className="w-full py-4 rounded-xl shadow-sm mb-6 bg-red-600">
                    <Text className="text-white font-bold text-xl text-center uppercase tracking-wider">{t('endShift')}</Text>
                  </TouchableOpacity>
                  <View className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-400">{t('currentStatusLabel')}</Text>
                      <Text className={`font-bold uppercase ${
                        status === 'working' ? 'text-green-400' :
                        status === 'break' ? 'text-yellow-400' :
                        status === 'poa' ? 'text-orange-400' : 'text-slate-400'
                      }`}>
                        {status === 'poa' ? t('poaActive') : t(status)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-400">{t('timerModeLabel')}</Text>
                      <Text className="text-white font-semibold">{timerMode} {t('targetLabel')}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-slate-400">{t('shiftDurationLabel')}</Text>
                      <Text className="text-white font-semibold">{formatTime(displaySeconds.shift)}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* --- Weekly Summary --- */}
          <WeeklySummary current={weeklyHours} previous={previousWeekHours} t={t} />

        </View>
      </ScrollView>
    </View>
  );
}
