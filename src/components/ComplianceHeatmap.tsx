import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, XCircle, X, AlertCircle as AlertCircleIcon } from 'react-native-feather';
import { supabase, WorkSession } from '../lib/supabase';
import { calculateCompliance } from '../lib/compliance'; // Import the centralized function

interface ComplianceHeatmapProps {
  onClose?: () => void;
  complianceMap: Map<string, { score: number; violations: string[] }>;
  isLoading: boolean;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
}

const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const getScoreColor = (score: number) => {
  if (score >= 90) return 'bg-green-600';
  if (score >= 70) return 'bg-yellow-600';
  return 'bg-red-600';
};

const getScoreIcon = (score: number) => {
  if (score >= 90) return <CheckCircle color="#22c55e" size={24} />;
  if (score >= 70) return <AlertTriangle color="#f59e0b" size={24} />;
  return <XCircle color="#ef4444" size={24} />;
};

function ComplianceHeatmap({ onClose, complianceMap, isLoading, currentDate, setCurrentDate }: ComplianceHeatmapProps) {

  const { monthScore, weekScore } = useMemo(() => {
    let totalMonthScore = 0;
    let monthSessionCount = 0;

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekStartStr = toLocalDateString(weekStart);

    let totalWeekScore = 0;
    let weekSessionCount = 0;

    complianceMap.forEach((result, dateStr) => {
        totalMonthScore += result.score;
        monthSessionCount++;

        if (dateStr >= weekStartStr) {
            totalWeekScore += result.score;
            weekSessionCount++;
        }
    });

    return {
      monthScore: monthSessionCount > 0 ? Math.round(totalMonthScore / monthSessionCount) : 100,
      weekScore: weekSessionCount > 0 ? Math.round(totalWeekScore / weekSessionCount) : 100
    };
  }, [complianceMap]);

  const { days, monthName } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const dayArray = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      dayArray.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      dayArray.push(day);
    }

    return {
        days: dayArray,
        monthName: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    };
  }, [currentDate]);

  const previousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  return (
    <View className="flex-1 justify-center items-center bg-black/75 p-4">
      <View className="bg-slate-800 rounded-2xl w-full h-[90%]">
        <View className="border-b border-slate-700 p-6 flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <AlertCircleIcon size={24} color="#60a5fa" />
            <Text className="text-2xl font-bold text-white">Compliance Score</Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} className="p-2 rounded-lg">
              <X color="white" size={24} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="flex-row items-center justify-between mb-6">
            <TouchableOpacity onPress={previousMonth} className="p-2 rounded-lg bg-slate-700">
              <ChevronLeft color="white" size={24} />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-white">{monthName}</Text>
            <TouchableOpacity onPress={nextMonth} className="p-2 rounded-lg bg-slate-700">
              <ChevronRight color="white" size={24} />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-4 mb-8 justify-center">
            <View className="items-center bg-slate-900 p-4 rounded-xl flex-1">
                <Text className="text-slate-400 text-xs mb-2">This Week</Text>
                <View className="flex-row items-center gap-2">
                    {getScoreIcon(weekScore)}
                    <Text className="text-3xl font-bold text-white">{weekScore}%</Text>
                </View>
            </View>
            <View className="items-center bg-slate-900 p-4 rounded-xl flex-1">
                <Text className="text-slate-400 text-xs mb-2">This Month</Text>
                 <View className="flex-row items-center gap-2">
                    {getScoreIcon(monthScore)}
                    <Text className="text-3xl font-bold text-white">{monthScore}%</Text>
                </View>
            </View>
          </View>

          {isLoading ? (
             <View className="h-64 justify-center items-center">
                <ActivityIndicator size="large" color="#60a5fa" />
             </View>
          ) : (
            <>
                <View className="flex-row mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} className="w-[14.28%] items-center py-2">
                        <Text className="text-xs font-semibold text-slate-500">{day}</Text>
                    </View>
                    ))}
                </View>

                <View className="flex-row flex-wrap">
                    {days.map((day, index) => {
                    if (day === null) {
                        return <View key={`empty-${index}`} className="w-[14.28%] aspect-square" />;
                    }

                    const dateStr = toLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                    const compliance = complianceMap.get(dateStr);
                    const dayColor = compliance ? getScoreColor(compliance.score) : 'bg-slate-700';

                    return (
                        <View key={day} className="w-[14.28%] aspect-square p-1">
                            <View className={`flex-1 rounded-lg items-center justify-center ${dayColor}`}>
                                <Text className="text-sm font-bold text-white">{day}</Text>
                            </View>
                        </View>
                    );
                    })}
                </View>
            </>
          )}
        </ScrollView>
        
        {onClose && (
            <View className="p-6 border-t border-slate-700">
                <TouchableOpacity onPress={onClose} className="w-full px-6 py-3 bg-blue-600 rounded-lg">
                    <Text className="text-white font-semibold text-center">Close</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>
    </View>
  );
}

export default ComplianceHeatmap;
