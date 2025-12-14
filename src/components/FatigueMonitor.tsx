import React from 'react';
import { View, Text } from 'react-native';
import { Activity, AlertTriangle, AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  workSeconds: number;
  breakSeconds: number;
  dailyRestSeconds: number | null;
}

export const FatigueMonitor: React.FC<Props> = ({ workSeconds, breakSeconds, dailyRestSeconds }) => {
  const { t } = useTranslation();

  const workHours = workSeconds / 3600;
  const breakMinutes = breakSeconds / 60;
  const restHours = dailyRestSeconds ? dailyRestSeconds / 3600 : null;

  let fatigueLevel = 0;
  let fatigueText = '';
  let fatigueColor = '';
  let warnings: string[] = [];

  if (workHours >= 12) {
      fatigueLevel = 90;
      fatigueText = t('criticalFatigue');
      fatigueColor = 'text-red-400';
      warnings.push(t('approaching13h'));
  } else if (workHours >= 10) {
      fatigueLevel = 75;
      fatigueText = t('highFatigue');
      fatigueColor = 'text-orange-400';
      warnings.push(t('over10h'));
  } else if (workHours >= 9) {
      fatigueLevel = 60;
      fatigueText = t('moderateFatigue');
      fatigueColor = 'text-yellow-400';
      if (breakMinutes < 45) warnings.push(t('need45minBreak'));
  } else if (workHours >= 6) {
      fatigueLevel = 40;
      fatigueText = t('mildFatigue');
      fatigueColor = 'text-yellow-400';
      if (breakMinutes < 30) warnings.push(t('need30minBreak'));
  } else if (workHours >= 4.5) {
      fatigueLevel = 25;
      fatigueText = t('freshAndFocused');
      fatigueColor = 'text-green-400';
  } else {
      fatigueLevel = 10;
      fatigueText = t('fullyAlert');
      fatigueColor = 'text-green-400';
  }

  if (restHours !== null && restHours < 11) {
      fatigueLevel = Math.min(100, fatigueLevel + 20);
      warnings.push(`${t('only') || 'Only'} ${restHours.toFixed(1)}h ${t('restSinceLast') || 'rest since last shift.'}`);
  }

  return (
      <View className="bg-slate-900 rounded-xl p-4 mb-6 border-l-4 border-blue-500">
          <View className="flex-row items-start gap-3">
              <Activity color="#60a5fa" size={24} />
              <View className="flex-1">
                  <Text className="text-sm font-semibold text-white mb-2">{t('fatigueFocusIndex')}</Text>
                  <View>
                      <View className="flex-row items-center justify-between mb-2">
                          <Text className={`font-semibold ${fatigueColor}`}>{fatigueText}</Text>
                          <Text className={`text-sm ${fatigueColor}`}>{fatigueLevel}%</Text>
                      </View>
                      <View className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                          <View
                              className={`h-full ${fatigueLevel >= 75 ? 'bg-red-500' : fatigueLevel >= 60 ? 'bg-orange-500' : fatigueLevel >= 40 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${fatigueLevel}%` }}
                          />
                      </View>
                  </View>
                  {warnings.length > 0 && (
                      <View className="mt-2 space-y-1">
                          {warnings.map((warning, idx) => (
                              <View key={idx} className="flex-row items-start gap-2">
                                  <AlertCircle size={14} color="#facc15" className="mt-0.5"/>
                                  <Text className="text-xs text-yellow-400">{warning}</Text>
                              </View>
                          ))}
                      </View>
                  )}
              </View>
          </View>
      </View>
  );
};
