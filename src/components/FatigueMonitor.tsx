import React from 'react';
import { View, Text } from 'react-native';
import { Activity, AlertCircle } from 'react-native-feather';
import { useTranslation } from 'react-i18next';

interface Props {
  workSeconds: number;
  breakSeconds: number;
  dailyRestSeconds: number | null;
  drivingSeconds: number;
  workTimeRemaining: number;
}

export const FatigueMonitor: React.FC<Props> = ({ workSeconds, breakSeconds, dailyRestSeconds, drivingSeconds, workTimeRemaining }) => {
  const { t } = useTranslation();

  const workHours = workSeconds / 3600;
  const breakMinutes = breakSeconds / 60;
  const restHours = dailyRestSeconds !== null ? dailyRestSeconds / 3600 : null;
  const drivingHours = drivingSeconds / 3600;

  let fatigueLevel = 0;
  let fatigueText = t('fatigue.fullyAlert');
  let warnings: string[] = [];

  // Logic based on your en.json structure
  if (workHours >= 13) {
    fatigueLevel = 100;
    fatigueText = t('fatigue.critical');
    warnings.push(t('fatigue.approaching13h'));
  } else if (workHours > 10) {
    fatigueLevel = 80;
    fatigueText = t('fatigue.high');
    warnings.push(t('fatigue.over10h'));
  } else if (workHours > 9) {
    fatigueLevel = 60;
    fatigueText = t('fatigue.moderate');
    if (breakMinutes < 45) warnings.push(t('fatigue.need45minBreak'));
  } else if (workHours > 6) {
    fatigueLevel = 40;
    fatigueText = t('fatigue.mild');
    if (breakMinutes < 30) warnings.push(t('fatigue.need30minBreak'));
  } else {
    fatigueLevel = Math.floor(workHours * 10);
    fatigueText = t('fatigue.freshAndFocused');
  }

  if (drivingHours >= 10) warnings.push(t('fatigue.drivingExceeded10h'));
  if (drivingHours > 9) warnings.push(t('fatigue.drivingOver9h'));
  if (restHours !== null && restHours < 9) warnings.push(t('fatigue.dailyRestBelow9h'));
  if (restHours !== null && restHours < 11) warnings.push(t('fatigue.reducedDailyRest'));
  if (workTimeRemaining < 0) warnings.push(t('fatigue.workTimeExceeded', { time: `${Math.floor(Math.abs(workTimeRemaining)/60)}m` }));


  const getFatigueColor = () => {
    if (fatigueLevel >= 80) return 'text-red-400';
    if (fatigueLevel >= 60) return 'text-orange-400';
    if (fatigueLevel >= 40) return 'text-yellow-400';
    return 'text-green-400';
  };
  const fatigueColor = getFatigueColor();

  return (
      <View className="bg-slate-900 rounded-xl p-4 mb-6 border-l-4 border-blue-500">
          <View className="flex-row items-start gap-3">
              <Activity color="#60a5fa" size={24} />
              <View className="flex-1">
                  <Text className="text-sm font-semibold text-white mb-2">{t('fatigue.title')}</Text>
                  <View>
                      <View className="flex-row items-center justify-between mb-2">
                          <Text className={`font-semibold ${fatigueColor}`}>{fatigueText}</Text>
                          <Text className={`text-sm ${fatigueColor}`}>{fatigueLevel}%</Text>
                      </View>
                      <View className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                          <View
                              className={`h-full ${fatigueColor.replace('text-', 'bg-')}`}
                              style={{ width: `${fatigueLevel}%` }}
                          />
                      </View>
                  </View>
                  {warnings.length > 0 && (
                      <View className="mt-4 space-y-2 border-t border-slate-700 pt-3">
                          {warnings.map((warning, idx) => (
                              <View key={idx} className="flex-row items-start gap-2">
                                  <AlertCircle size={14} color="#facc15" className="mt-0.5"/>
                                  <Text className="text-xs text-yellow-400 flex-1">{warning}</Text>
                              </View>
                          ))}
                      </View>
                  )}
              </View>
          </View>
      </View>
  );
};
