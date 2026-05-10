import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, Truck, ChevronLeft, Info } from 'react-native-feather';
import { format, parseISO, isSameDay } from 'date-fns';

interface Shift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  vehicles: {
    reg_number: string;
  } | { reg_number: string }[] | null;
}

export default function MyScheduleScreen({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const { session, profile } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchShifts = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from('shifts')
        .select(`
          id,
          date,
          start_time,
          end_time,
          notes,
          vehicles (reg_number)
        `)
        .eq('driver_id', session.user.id)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error('Error fetching shifts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchShifts();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('my_shifts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
          filter: `driver_id=eq.${session?.user?.id}`,
        },
        () => {
          fetchShifts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchShifts, session?.user?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchShifts();
  };

  const renderShiftItem = ({ item }: { item: Shift }) => {
    const shiftDate = parseISO(item.date);
    const isToday = isSameDay(shiftDate, new Date());

    const vehicle = Array.isArray(item.vehicles) ? item.vehicles[0] : item.vehicles;

    return (
      <View className={`mb-4 p-4 rounded-xl border ${isToday ? 'bg-brand-accent/10 border-brand-accent' : 'bg-slate-800/50 border-slate-700'}`}>
        <View className="flex-row justify-between items-center mb-3">
          <View className="flex-row items-center gap-2">
            <Calendar size={18} color={isToday ? '#2563EB' : '#94A3B8'} />
            <Text className={`font-bold ${isToday ? 'text-brand-accent' : 'text-white'}`}>
              {format(shiftDate, 'EEEE, do MMMM')}
              {isToday && ` (${t('common.today', 'Today')})`}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-6 mb-3">
          <View className="flex-row items-center gap-2">
            <Clock size={16} color="#94A3B8" />
            <Text className="text-slate-200">
              {item.start_time.substring(0, 5)} - {item.end_time.substring(0, 5)}
            </Text>
          </View>
          {vehicle?.reg_number && (
            <View className="flex-row items-center gap-2">
              <Truck size={16} color="#94A3B8" />
              <Text className="text-slate-200 font-bold">{vehicle.reg_number}</Text>
            </View>
          )}
        </View>

        {item.notes && (
          <View className="flex-row gap-2 mt-2 pt-2 border-t border-slate-700/50">
            <Info size={14} color="#60A5FA" style={{ marginTop: 2 }} />
            <Text className="text-slate-400 text-sm flex-1 italic">
              {item.notes}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-dark">
      <View className="px-4 py-3 flex-row items-center bg-brand-accent shadow-lg">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2">
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-50 ml-2">{t('schedule.title', 'My Schedule')}</Text>
      </View>

      <View className="flex-1 p-4">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <FlatList
            data={shifts}
            renderItem={renderShiftItem}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Calendar size={48} color="#475569" />
                <Text className="text-slate-400 mt-4 text-center px-6">
                  {t('schedule.emptyState', 'No upcoming shifts assigned. Please check back later or contact your manager.')}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
