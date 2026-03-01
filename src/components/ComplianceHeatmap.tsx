import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, XCircle, X, AlertCircle as AlertCircleIcon, Clock, Coffee, Truck, User } from 'react-native-feather';
import { DayComplianceInfo } from '../hooks/useComplianceData';

interface ComplianceHeatmapProps {
  onClose?: () => void;
  complianceMap: Map<string, DayComplianceInfo>;
  isLoading: boolean;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
}

const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getScoreColor = (score?: number) => {
  if (score === undefined) return 'bg-slate-700';
  if (score >= 90) return 'bg-green-600';
  if (score >= 70) return 'bg-yellow-600';
  return 'bg-red-600';
};

const getScoreIcon = (score: number) => {
  if (score >= 90) return <CheckCircle color="#22c55e" size={24} />;
  if (score >= 70) return <AlertTriangle color="#f59e0b" size={24} />;
  return <XCircle color="#ef4444" size={24} />;
};

const DetailRow = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) => (
    <View className="flex-row items-center justify-between py-3 border-b border-slate-700">
        <View className="flex-row items-center gap-3">
            {icon}
            <Text className="text-slate-300">{label}</Text>
        </View>
        <Text className="text-white font-semibold">{value}</Text>
    </View>
);

function ComplianceHeatmap({ onClose, complianceMap, isLoading, currentDate, setCurrentDate }: ComplianceHeatmapProps) {
  const [selectedDayInfo, setSelectedDayInfo] = useState<DayComplianceInfo | null>(null);

  const { monthScore, weekScore } = useMemo(() => {
    let totalMonthScore = 0, monthSessionCount = 0, totalWeekScore = 0, weekSessionCount = 0;
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekStartStr = toLocalDateString(weekStart);

    complianceMap.forEach((result, dateStr) => {
      if (new Date(dateStr).getMonth() === currentDate.getMonth()) {
        totalMonthScore += result.score;
        monthSessionCount++;
      }
      if (dateStr >= weekStartStr) {
        totalWeekScore += result.score;
        weekSessionCount++;
      }
    });
    return {
      monthScore: monthSessionCount > 0 ? Math.round(totalMonthScore / monthSessionCount) : 100,
      weekScore: weekSessionCount > 0 ? Math.round(totalWeekScore / weekSessionCount) : 100
    };
  }, [complianceMap, currentDate]);

  const { days, monthName } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dayArray = Array.from({ length: firstDay.getDay() }, () => null);
    for (let day = 1; day <= lastDay.getDate(); day++) { dayArray.push(day); }
    return { days: dayArray, monthName: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }, [currentDate]);

  const previousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  if (selectedDayInfo) {
    return (
      <View className="flex-1 justify-center items-center bg-black/75 p-4">
        <View className="bg-slate-800 rounded-2xl w-full max-h-[90%]">
          <View className="border-b border-slate-700 p-6">
            <Text className="text-lg font-bold text-white text-center">
              {new Date(selectedDayInfo.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View className="items-center bg-slate-900 p-4 rounded-xl mb-6">
                <Text className="text-slate-400 text-xs mb-2">Compliance Score</Text>
                <View className="flex-row items-center gap-2">
                    {getScoreIcon(selectedDayInfo.score)}
                    <Text className="text-3xl font-bold text-white">{selectedDayInfo.score}%</Text>
                </View>
            </View>
            <DetailRow icon={<Clock size={20} color="#4ade80"/>} label="Total Work" value={formatDuration(selectedDayInfo.totalWork)} />
            <DetailRow icon={<Truck size={20} color="#60a5fa"/>} label="Total Driving" value={formatDuration(selectedDayInfo.totalDrive)} />
            <DetailRow icon={<Coffee size={20} color="#facc15"/>} label="Total Breaks" value={formatDuration(selectedDayInfo.totalBreak)} />
            <DetailRow icon={<User size={20} color="#fb923c"/>} label="Total POA" value={formatDuration(selectedDayInfo.totalPoa)} />

            {selectedDayInfo.violations.length > 0 && (
              <View className="mt-6">
                <Text className="text-lg font-bold text-white mb-2">Violations Recorded</Text>
                <View className="bg-slate-900/50 p-4 rounded-lg space-y-2">
                    {selectedDayInfo.violations.map((v, i) => <Text key={i} className="text-red-400 text-sm">- {v.replace(/_/g, ' ')}</Text>)}
                </View>
              </View>
            )}
          </ScrollView>
          <View className="p-6 border-t border-slate-700">
            <TouchableOpacity onPress={() => setSelectedDayInfo(null)} className="w-full px-6 py-3 bg-blue-600 rounded-lg">
              <Text className="text-white font-semibold text-center">Back to Calendar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center items-center bg-black/75 p-4">
      <View className="bg-slate-800 rounded-2xl w-full h-[90%]">
        <View className="border-b border-slate-700 p-6 flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <AlertCircleIcon size={24} color="#60a5fa" /><Text className="text-2xl font-bold text-white">Compliance Score</Text>
          </View>
          {onClose && <TouchableOpacity onPress={onClose} className="p-2 rounded-lg"><X color="white" size={24} /></TouchableOpacity>}
        </View>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="flex-row items-center justify-between mb-6">
            <TouchableOpacity onPress={previousMonth} className="p-2 rounded-lg bg-slate-700"><ChevronLeft color="white" size={24} /></TouchableOpacity>
            <Text className="text-xl font-bold text-white">{monthName}</Text>
            <TouchableOpacity onPress={nextMonth} className="p-2 rounded-lg bg-slate-700"><ChevronRight color="white" size={24} /></TouchableOpacity>
          </View>
          <View className="flex-row gap-4 mb-8 justify-center">
            <View className="items-center bg-slate-900 p-4 rounded-xl flex-1">
                <Text className="text-slate-400 text-xs mb-2">This Week</Text>
                <View className="flex-row items-center gap-2">{getScoreIcon(weekScore)}<Text className="text-3xl font-bold text-white">{weekScore}%</Text></View>
            </View>
            <View className="items-center bg-slate-900 p-4 rounded-xl flex-1">
                <Text className="text-slate-400 text-xs mb-2">This Month</Text>
                 <View className="flex-row items-center gap-2">{getScoreIcon(monthScore)}<Text className="text-3xl font-bold text-white">{monthScore}%</Text></View>
            </View>
          </View>
          {isLoading ? <View className="h-64 justify-center items-center"><ActivityIndicator size="large" color="#60a5fa" /></View> : (
            <>
              <View className="flex-row mb-2">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (<View key={day} className="w-[14.28%] items-center py-2"><Text className="text-xs font-semibold text-slate-500">{day}</Text></View>))}</View>
              <View className="flex-row flex-wrap">
                {days.map((day, index) => {
                  if (day === null) return <View key={`empty-${index}`} className="w-[14.28%] aspect-square" />;
                  const dateStr = toLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                  const compliance = complianceMap.get(dateStr);
                  return (
                    <View key={day} className="w-[14.28%] aspect-square p-1">
                      <TouchableOpacity onPress={() => compliance && setSelectedDayInfo(compliance)} disabled={!compliance} className={`flex-1 rounded-lg items-center justify-center ${getScoreColor(compliance?.score)} ${!compliance ? 'opacity-30' : ''}`}>
                        <Text className="text-sm font-bold text-white">{day}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
        {onClose && (<View className="p-6 border-t border-slate-700"><TouchableOpacity onPress={onClose} className="w-full px-6 py-3 bg-blue-600 rounded-lg"><Text className="text-white font-semibold text-center">Close</Text></TouchableOpacity></View>)}
      </View>
    </View>
  );
}

export default ComplianceHeatmap;
