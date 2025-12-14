import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, XCircle, X, AlertCircle as AlertCircleIcon } from 'lucide-react-native';
import { supabase, WorkSession } from '../lib/supabase';

interface ComplianceHeatmapProps {
  timezone: string;
  onClose?: () => void;
}

interface DayCompliance {
  date: string;
  score: number;
  violations: string[];
}

// --- Helper Functions & Constants ---

const VIOLATION_RULES = {
  MAX_HOURS: 13,
  BREAK_6H_THRESHOLD: 30, // minutes
  BREAK_9H_THRESHOLD: 45  // minutes
};

// Helper to handle local dates correctly (avoids UTC shifts from toISOString)
const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const calculateSessionScore = (session: WorkSession): DayCompliance => {
  let score = 100;
  const violations: string[] = [];

  const hours = (session.total_work_minutes || 0) / 60;
  const totalBreaks =
    (session.break_15_count || 0) * 15 +
    (session.break_30_count || 0) * 30 +
    (session.break_45_count || 0) * 45;

  if (hours > 6 && totalBreaks < VIOLATION_RULES.BREAK_6H_THRESHOLD) {
    violations.push('Insufficient breaks (6h+)');
    score -= 30;
  }

  if (hours > 9 && totalBreaks < VIOLATION_RULES.BREAK_9H_THRESHOLD) {
    violations.push('Insufficient breaks (9h+)');
    score -= 30;
  }

  if (hours > VIOLATION_RULES.MAX_HOURS) {
    violations.push('Exceeded 13h limit');
    score -= 40;
  }

  return {
    date: session.date,
    score: Math.max(0, score),
    violations
  };
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


// --- Main Component ---

function ComplianceHeatmap({ timezone, onClose }: ComplianceHeatmapProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Fetch Sessions
  useEffect(() => {
    let isMounted = true;

    const fetchSessions = async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      // Calculate dates using local time helper to match DB format YYYY-MM-DD
      const firstDay = toLocalDateString(new Date(year, month, 1));
      const lastDay = toLocalDateString(new Date(year, month + 1, 0));

      const { data, error } = await supabase
        .from('work_sessions')
        // Optimize query: select only needed columns
        .select('date, total_work_minutes, break_15_count, break_30_count, break_45_count, end_time')
        .eq('user_id', user.id)
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: true });

      if (isMounted) {
        if (data) {
          setSessions(data);
        } else {
          setSessions([]);
        }
        if (error) console.error('Error fetching sessions:', error);
        setIsLoading(false);
      }
    };

    fetchSessions();

    return () => { isMounted = false; };
  }, [currentDate]);

  // 2. Derived State (Memoized Calculation)
  const { complianceMap, monthScore, weekScore } = useMemo(() => {
    const map = new Map<string, DayCompliance>();
    let totalMonthScore = 0;
    let sessionCount = 0;

    // Week calculation setup
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of *current real-world* week
    const weekStartStr = toLocalDateString(weekStart);

    let totalWeekScore = 0;
    let weekSessionCount = 0;

    sessions.forEach((session: WorkSession) => {
      if (!session.end_time) return;

      const result = calculateSessionScore(session);
      map.set(session.date, result);

      // Accumulate Month Stats
      totalMonthScore += result.score;
      sessionCount++;

      // Accumulate Week Stats (Only if session matches current week)
      // We compare strings YYYY-MM-DD to handle comparison safely
      if (session.date >= weekStartStr) {
          totalWeekScore += result.score;
          weekSessionCount++;
      }
    });

    return {
      complianceMap: map,
      monthScore: sessionCount > 0 ? Math.round(totalMonthScore / sessionCount) : 100,
      weekScore: weekSessionCount > 0 ? Math.round(totalWeekScore / weekSessionCount) : 100
    };
  }, [sessions]);

  // 3. Calendar Grid Logic
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
        {/* Header */}
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
          {/* Month Navigation */}
          <View className="flex-row items-center justify-between mb-6">
            <TouchableOpacity onPress={previousMonth} className="p-2 rounded-lg bg-slate-700">
              <ChevronLeft color="white" size={24} />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-white">{monthName}</Text>
            <TouchableOpacity onPress={nextMonth} className="p-2 rounded-lg bg-slate-700">
              <ChevronRight color="white" size={24} />
            </TouchableOpacity>
          </View>

          {/* Summary Cards */}
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
                {/* Day Headers */}
                <View className="flex-row mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} className="w-[14.28%] items-center py-2">
                        <Text className="text-xs font-semibold text-slate-500">{day}</Text>
                    </View>
                    ))}
                </View>

                {/* Grid */}
                <View className="flex-row flex-wrap">
                    {days.map((day, index) => {
                    if (day === null) {
                        // 14.28% = 1/7th width
                        return <View key={`empty-${index}`} className="w-[14.28%] aspect-square" />;
                    }

                    const dateStr = toLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                    const compliance = complianceMap.get(dateStr);
                    const dayColor = compliance ? getScoreColor(compliance.score) : 'bg-slate-700';

                    // Add padding-1 to create the gap visual without breaking the flex layout
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
