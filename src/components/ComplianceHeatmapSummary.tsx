import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

interface DayComplianceInfo {
  date: string;
  score: number;
  violations: string[];
}

interface ComplianceHeatmapSummaryProps {
  onPress: () => void;
  complianceMap: Map<string, DayComplianceInfo>;
  isLoading: boolean;
  currentDate: Date;
}

const toLocalDateString = (date: Date) => date.toISOString().split('T')[0];

const getScoreColor = (score: number | null) => {
  if (score === null) return 'bg-brand-dark';
  if (score >= 90) return 'bg-green-600';
  if (score >= 70) return 'bg-yellow-600';
  return 'bg-red-600';
};

export default function ComplianceHeatmapSummary({
  onPress,
  complianceMap,
  isLoading,
  currentDate,
}: ComplianceHeatmapSummaryProps) {
  const { t, ready } = useTranslation();

  const days = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startingDayOfWeek = firstDay.getDay(); // 0 Sun ... 6 Sat
    if (startingDayOfWeek === 0) startingDayOfWeek = 6;
    else startingDayOfWeek = startingDayOfWeek - 1;

    const dayArray: Array<number | null> = Array(startingDayOfWeek).fill(null);
    for (let d = 1; d <= daysInMonth; d++) dayArray.push(d);

    return dayArray;
  }, [currentDate]);

  if (!ready) {
    return (
      <View className="bg-brand-card rounded-2xl p-4 mb-6 border border-brand-border">
        <ActivityIndicator size="small" color="#60a5fa" />
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} className="bg-brand-card rounded-2xl p-4 mb-6 border border-brand-border">
      <Text className="text-lg font-bold text-slate-50 mb-4">{t('complianceScorecard.title')}</Text>

      {isLoading ? (
        <View className="h-48 justify-center items-center">
          <ActivityIndicator size="large" color="#60a5fa" />
        </View>
      ) : (
        <>
          <View className="flex-row mb-2">
            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => (
              <View key={d} className="w-[14.28%] items-center py-1">
                <Text className="text-xs font-semibold text-slate-400">{t(`day.${d}`)}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {days.map((day, index) => {
              if (day === null) return <View key={`empty-${index}`} className="w-[14.28%] aspect-square" />;

              const dateStr = toLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
              const compliance = complianceMap.get(dateStr);

              return (
                <View key={`day-${day}`} className="w-[14.28%] aspect-square p-1">
                  <View className={`flex-1 rounded-md items-center justify-center ${getScoreColor(compliance?.score ?? null)}`}>
                    <Text className="text-xs font-bold text-slate-50">{day}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}