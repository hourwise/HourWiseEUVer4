import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { ChevronLeft, ChevronRight, Edit, Plus, X, DollarSign, Clock } from 'react-native-feather';
import { supabase, WorkSession } from '../lib/supabase';
import { calculatePayFromRaw, formatCurrency } from '../lib/payCalculations';
import SessionEditorModal from './SessionEditorModal';


// --- Types ---

interface CalendarViewProps {
  timezone: string;
  userId: string;
  onClose: () => void;
  onDataChanged: () => void;
}

type PeriodView = 'monthly' | '4-weekly';

interface PayConfig {
  hourly_rate: number;
  shift_allowance: number;
  overtime_threshold_hours: number | null;
  overtime_rate_multiplier: number | null;
  overtime_rate_percentage: number | null;
  unpaid_break_minutes: number;
  additional_overtime_tiers: any[];
}

// --- Custom Hooks ---

const usePayConfig = (userId: string) => {
  const [payConfig, setPayConfig] = useState<PayConfig | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!userId) return;
      try {
        console.log("DEBUG: Fetching Pay Config for User ID:", userId);
        const { data: config, error: configError } = await supabase
          .from('pay_configurations')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (configError) {
            if (configError.code !== 'PGRST116') {
                console.error("DEBUG: Pay Config Error:", configError);
            }
            return;
        }

        if (config) {
            setPayConfig(config);
        }
      } catch (error) {
        console.error('Error fetching pay config:', error);
      }
    };
    fetchConfig();
  }, [userId]);

  return payConfig;
};


const useWorkSessions = (userId: string, currentDate: Date, periodView: PeriodView) => {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    let firstDay, lastDay;

    if (periodView === 'monthly') {
      firstDay = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
      lastDay = new Date(Date.UTC(year, month + 1, 0)).toISOString().split('T')[0];
    } else {
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 27);
      firstDay = start.toISOString().split('T')[0];
      lastDay = end.toISOString().split('T')[0];
    }

    const { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: true });

    if (!error && data) setSessions(data);
    else setSessions([]);
    setLoading(false);
  }, [userId, currentDate, periodView]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  return { sessions, refreshSessions: fetchSessions, loading };
};

// --- Helper Functions & Components ---

const formatTimeFromMinutes = (minutes: number) => {
  if (minutes === null || isNaN(minutes)) return '0h 0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
};

const DayDetailsModal = ({ visible, onClose, selectedDate, sessions, dailyPay, timezone, onAddShift, onEditShift }: any) => {
  if (!visible || !selectedDate) return null;

  const formatDateTime = (dateTimeStr: string) => new Date(dateTimeStr).toLocaleString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const sessionsForDay = sessions.filter((s: WorkSession) => s.date === selectedDate);

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent={true} animationType="fade">
        <View className="flex-1 justify-end items-center bg-black/70">
            <View className="bg-slate-900 rounded-t-2xl p-4 w-full border-t-2 border-slate-700 shadow-xl max-h-[80%]">
                <View className="flex-row justify-between items-center mb-4 px-2">
                    <Text className="text-xl font-bold text-white">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                    <TouchableOpacity onPress={onClose} className="p-2 bg-slate-800 rounded-full"><X size={20} color="white" /></TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                    {sessionsForDay.length > 0 ? (
                        <>
                            <View className="bg-slate-800 rounded-lg p-4 mb-4 border border-slate-700">
                                <Text className="text-white font-bold mb-3 text-lg border-b border-slate-700 pb-2">Day Summary</Text>
                                <View className="flex-row justify-between mb-2"><Text className="text-slate-400">Total Work:</Text><Text className="text-white font-semibold">{formatTimeFromMinutes(sessionsForDay.reduce((acc: number, s: WorkSession) => acc + (s.total_work_minutes || 0), 0))}</Text></View>
                                <View className="flex-row justify-between mb-2"><Text className="text-slate-400">Total Breaks:</Text><Text className="text-white font-semibold">{formatTimeFromMinutes(sessionsForDay.reduce((acc: number, s: WorkSession) => acc + (s.total_break_minutes || 0), 0))}</Text></View>
                                <View className="mt-2 pt-2 border-t border-slate-700 flex-row justify-between items-center"><Text className="text-slate-300 font-bold">Est. Earnings:</Text><Text className="text-green-400 font-bold text-lg">{formatCurrency(dailyPay?.totalPay)}</Text></View>
                            </View>
                            <Text className="text-lg font-semibold text-white mb-2 px-2">Recorded Shifts</Text>
                            {sessionsForDay.map((session: WorkSession) => (
                                <TouchableOpacity key={session.id} onPress={() => onEditShift(session)} className="bg-slate-800 rounded-lg p-3 mb-2 border border-slate-700">
                                    <View className="flex-row justify-between items-center">
                                        <View>
                                            <Text className="text-white font-semibold">{formatDateTime(session.start_time)} - {session.end_time ? formatDateTime(session.end_time) : 'Ongoing'}</Text>
                                            <Text className="text-slate-400 text-xs mt-1">Work Time: {formatTimeFromMinutes(session.total_work_minutes)}</Text>
                                        </View>
                                        <Edit size={18} color="#94a3b8"/>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </>
                    ) : (
                        <View className="bg-slate-800 rounded-lg p-6 items-center justify-center border-2 border-slate-700 border-dashed">
                            <Text className="text-2xl font-bold text-slate-400 mb-2">Rest Day</Text>
                            <Text className="text-slate-400 text-center">No shifts recorded for this date.</Text>
                        </View>
                    )}
                </ScrollView>
                <View className="absolute bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-700">
                     <TouchableOpacity onPress={onAddShift} className="flex-row gap-2 items-center justify-center bg-green-600 px-3 py-3 rounded-lg">
                        <Plus size={20} color="white" />
                        <Text className="text-white font-bold text-lg">Add New Shift</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
  );
};


// --- Main Component ---

export default function CalendarView({ timezone, userId, onClose, onDataChanged }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [periodView, setPeriodView] = useState<PeriodView>('monthly');

  const [editingSession, setEditingSession] = useState<WorkSession | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [newShiftDate, setNewShiftDate] = useState<string | null>(null);

  const payConfig = usePayConfig(userId);
  const { sessions, refreshSessions } = useWorkSessions(userId, currentDate, periodView);

  const dailyPays = useMemo(() => {
    if (!payConfig || sessions.length === 0) return new Map();
    // Use the adapter to handle raw Supabase data and get a map of daily pay details
    return calculatePayFromRaw(sessions, payConfig);
  }, [sessions, payConfig]);

  const monthlyTotals = useMemo(() => {
    let workMins = 0, breakMins = 0, poaMins = 0, totalPay = 0;
    const workedDates = new Set<string>();
    sessions.forEach(s => {
        if(s.total_work_minutes) workMins += s.total_work_minutes;
        if(s.total_break_minutes) breakMins += s.total_break_minutes;
        if(s.total_poa_minutes) poaMins += s.total_poa_minutes;
        workedDates.add(s.date);
    });
    dailyPays.forEach((payDetails) => { totalPay += payDetails.totalPay; });
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    return { work: workMins, break: breakMins, poa: poaMins, restDays: daysInMonth - workedDates.size, pay: totalPay };
  }, [sessions, dailyPays, currentDate]);

  const { weeks, monthName } = useMemo(() => {
    const year = currentDate.getFullYear(), month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate(), startingDayOfWeek = (firstDay.getDay() + 6) % 7;
    const days = Array.from({ length: startingDayOfWeek }, () => null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
    const grid = [];
    for (let i = 0; i < days.length; i += 7) grid.push(days.slice(i, i + 7));
    if (grid[grid.length - 1].length < 7) {
      grid[grid.length - 1] = grid[grid.length - 1].concat(Array(7 - grid[grid.length - 1].length).fill(null));
    }
    return { weeks: grid, monthName: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }, [currentDate]);

  const navigateMonth = (direction: number) => setCurrentDate(d => { const n = new Date(d); n.setMonth(d.getMonth() + direction); return n; });
  const handleDayPress = (day: number) => setSelectedDate(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const handleEditShift = (session: WorkSession) => { setEditingSession(session); setIsEditorOpen(true); setNewShiftDate(null); setSelectedDate(null); };
  const handleAddShift = () => { setNewShiftDate(selectedDate); setEditingSession(null); setIsEditorOpen(true); setSelectedDate(null); };

  return (
    <View className="flex-1 bg-slate-950 pt-12">
      <View className="px-4 pb-2 flex-row justify-between items-center border-b border-slate-800">
        <Text className="text-white text-xl font-bold">Work History</Text>
        <TouchableOpacity onPress={onClose} className="p-2 bg-slate-800 rounded-full"><X size={24} color="white" /></TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        <View className="flex-row justify-between items-center mb-6 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <TouchableOpacity onPress={() => navigateMonth(-1)} className="p-2"><ChevronLeft color="white" size={24} /></TouchableOpacity>
            <Text className="text-xl font-bold text-white">{monthName}</Text>
            <TouchableOpacity onPress={() => navigateMonth(1)} className="p-2"><ChevronRight color="white" size={24} /></TouchableOpacity>
        </View>

        <View className="bg-slate-900 rounded-xl p-4 mb-6 border border-slate-800 shadow-lg">
            <View className="flex-row mb-4 border-b border-slate-700 pb-2">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <Text key={i} className="flex-1 text-center text-slate-500 font-semibold">{day}</Text>)}
            </View>
            {weeks.map((week: any, weekIndex: number) => (
                <View key={weekIndex} className="flex-row mb-2">
                    {week.map((day: any, dayIndex: number) => {
                        if (!day) return <View key={dayIndex} className="flex-1 p-2" />;
                        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const hasSession = sessions.some(s => s.date === dateStr);
                        return (
                            <TouchableOpacity key={dayIndex} onPress={() => handleDayPress(day)} className={`flex-1 p-1 aspect-square justify-center items-center rounded-lg border ${hasSession ? 'bg-blue-900/30 border-blue-500/50' : 'border-transparent'}`}>
                                <Text className={`text-sm font-semibold ${hasSession ? 'text-blue-400' : 'text-white'}`}>{day}</Text>
                                {hasSession && <View className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400" />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>

        <View className="bg-slate-900 rounded-xl p-4 mb-4 border border-slate-800">
            <Text className="text-white font-bold text-lg mb-3">Monthly Time Summary</Text>
            <View className="flex-row flex-wrap gap-4">
                 <View className="w-[47%] bg-slate-800 p-3 rounded-lg"><Text className="text-slate-400 text-xs">Total Work</Text><Text className="text-white font-bold text-lg">{formatTimeFromMinutes(monthlyTotals.work)}</Text></View>
                 <View className="w-[47%] bg-slate-800 p-3 rounded-lg"><Text className="text-slate-400 text-xs">Total Breaks</Text><Text className="text-white font-bold text-lg">{formatTimeFromMinutes(monthlyTotals.break)}</Text></View>
                 <View className="w-[47%] bg-slate-800 p-3 rounded-lg"><Text className="text-slate-400 text-xs">Total POA</Text><Text className="text-white font-bold text-lg">{formatTimeFromMinutes(monthlyTotals.poa)}</Text></View>
                 <View className="w-[47%] bg-slate-800 p-3 rounded-lg"><Text className="text-slate-400 text-xs">Rest Days</Text><Text className="text-green-400 font-bold text-lg">{monthlyTotals.restDays} Days</Text></View>
            </View>
        </View>

        <View className="bg-slate-900 rounded-xl p-4 mb-8 border border-slate-800">
            <View className="flex-row justify-between items-center mb-2"><Text className="text-white font-bold text-lg">Estimated Gross Pay</Text><View className="bg-green-900/30 px-2 py-1 rounded border border-green-800"><Text className="text-green-400 text-xs font-bold">ESTIMATE</Text></View></View>
            <Text className="text-slate-400 text-xs mb-3">Based on configured rates for {monthName}. Excludes tax.</Text>
            <View className="bg-slate-800 p-4 rounded-lg border border-slate-700 items-center"><Text className="text-green-400 font-bold text-3xl">{formatCurrency(monthlyTotals.pay)}</Text></View>
        </View>
      </ScrollView>

      <DayDetailsModal visible={!!selectedDate} onClose={() => setSelectedDate(null)} selectedDate={selectedDate} sessions={sessions} dailyPay={selectedDate ? dailyPays.get(selectedDate) : null} timezone={timezone} onAddShift={handleAddShift} onEditShift={handleEditShift} />
      {isEditorOpen && <SessionEditorModal visible={isEditorOpen} onClose={() => setIsEditorOpen(false)} sessionToEdit={editingSession} selectedDate={newShiftDate} onSave={() => { setIsEditorOpen(false); refreshSessions(); onDataChanged(); }} />}
    </View>
  );
}
