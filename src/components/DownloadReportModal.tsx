import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { X, FileDown } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { formatCurrency, calculateDailyPay } from '../lib/payCalculations';

interface DownloadReportModalProps {
  // FIX: t is now a function
  t: (key: string) => string;
  onClose: () => void;
  visible: boolean;
}

type ReportRange = 'last_week' | 'last_month' | 'custom';
type ReportFormat = 'pdf' | 'csv';

export default function DownloadReportModal({ t, onClose, visible }: DownloadReportModalProps) {
  const [range, setRange] = useState<ReportRange>('last_week');
  const [reportFormat, setReportFormat] = useState<ReportFormat>('pdf');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [payConfig, setPayConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPayConfig = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profiles } = await supabase.from('driver_profiles').select('id').eq('user_id', user.id).maybeSingle();
        if (profiles) {
          const { data: config } = await supabase.from('pay_configurations').select('*').eq('driver_profile_id', profiles.id).maybeSingle();
          if (config) setPayConfig(config);
        }
      } catch (error) {
        console.error('Error fetching pay config:', error);
      }
    };
    if (visible) fetchPayConfig();
  }, [visible]);

  const getRangeDates = () => {
    const now = new Date();
    const weekOptions = { weekStartsOn: 1 as const }; // Monday

    switch (range) {
      case 'last_week':
        const lastWeek = subWeeks(now, 1);
        return {
          start: startOfWeek(lastWeek, weekOptions),
          end: endOfWeek(lastWeek, weekOptions)
        };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth)
        };
      case 'custom':
        return { start: startDate, end: endDate };
      default:
        return { start: now, end: now };
    }
  };

  const generateReport = async () => {
    const { start, end } = getRangeDates();

    if (range === 'custom' && end < start) {
      Alert.alert(t('error'), t('dateRangeError') || 'End date must be after start date.');
      return;
    }

    setIsLoading(true);

    try {
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');

      const { data: sessions, error } = await supabase
        .from('work_sessions')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('start_time', { ascending: true });

      if (error || !sessions || sessions.length === 0) {
        Alert.alert(t('error'), t('noDataForRange') || 'No data found for this range.');
        return;
      }

      if (reportFormat === 'pdf') {
        await generatePdf(sessions, start, end);
      } else {
        await generateCsv(sessions, start, end);
      }
    } catch (err) {
      console.error("Report generation error:", err);
      Alert.alert(t('error'), t('failedToGenerate') || "Failed to generate report");
    } finally {
      setIsLoading(false);
    }
  };

  const generatePdf = async (sessions: any[], start: Date, end: Date) => {
    let totalWork = 0;
    let totalBreak = 0;
    let totalPoa = 0;
    let totalPay = 0;

    const sessionsByDate = sessions.reduce((acc, session) => {
        const date = session.date;
        if(!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
    }, {} as Record<string, any[]>);

    let sessionRows = '';
    for (const date in sessionsByDate) {
        const daySessions = sessionsByDate[date];
        const dailyPay = payConfig ? calculateDailyPay(daySessions, payConfig) : 0;
        totalPay += dailyPay;

        const dateObj = new Date(date);
        const displayDate = format(dateObj, 'PPP');

        sessionRows += `
          <div class="date-group">
            <h2>${displayDate}</h2>
            <table>
              <thead><tr><th>${t('startTime')}</th><th>${t('endTime')}</th><th>${t('workTime')}</th><th>${t('totalBreakTime')}</th><th>${t('totalPOATime')}</th></tr></thead>
              <tbody>`;

        daySessions.forEach((session: any) => {
            const work = session.total_work_minutes || 0;
            const breakT = session.total_break_minutes || 0;
            const poa = session.total_poa_minutes || 0;
            totalWork += work;
            totalBreak += breakT;
            totalPoa += poa;

            sessionRows += `<tr>
                <td>${new Date(session.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${session.end_time ? new Date(session.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}</td>
                <td>${Math.floor(work/60)}h ${work%60}m</td>
                <td>${Math.floor(breakT/60)}h ${breakT%60}m</td>
                <td>${Math.floor(poa/60)}h ${poa%60}m</td>
            </tr>`;
        });

        sessionRows += `
              </tbody>
            </table>
            ${payConfig ? `<p class="daily-pay">${t('estimatedEarnings')}: ${formatCurrency(dailyPay)}</p>` : ''}
          </div>`;
    }

    const htmlContent = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: Helvetica, sans-serif; margin: 20px; color: #333; }
            h1 { color: #2563eb; }
            h2 { font-size: 16px; margin-top: 0; border-bottom: 2px solid #eee; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f8fafc; font-weight: bold; }
            .summary { background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .date-group { margin-bottom: 20px; }
            .daily-pay { text-align: right; font-weight: bold; color: #059669; margin-top: 5px; }
          </style>
        </head>
        <body>
          <h1>${t('workReport')}</h1>
          <p>${t('reportFrom') || 'Report From'} <strong>${format(start, 'PP')}</strong> ${t('to') || 'to'} <strong>${format(end, 'PP')}</strong></p>

          <div class="summary">
            <h2>${t('summary')}</h2>
            <p><strong>${t('totalWorkTime')}:</strong> ${Math.floor(totalWork/60)}h ${totalWork%60}m</p>
            <p><strong>${t('totalBreakTime')}:</strong> ${Math.floor(totalBreak/60)}h ${totalBreak%60}m</p>
            <p><strong>${t('totalPOATime')}:</strong> ${Math.floor(totalPoa/60)}h ${totalPoa%60}m</p>
            ${payConfig ? `<p><strong>${t('estimatedEarnings')}:</strong> ${formatCurrency(totalPay)}</p>` : ''}
          </div>

          ${sessionRows}
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { dialogTitle: t('downloadReport'), mimeType: 'application/pdf' });
    } catch (e) {
      console.error("Print Error", e);
      Alert.alert(t('error'), "Could not generate PDF");
    }
  };

  const generateCsv = async (sessions: any[], start: Date, end: Date) => {
    // Use translation keys for headers if available, or fallback to English
    const headers = [
      t('date') || 'Date',
      t('startTime') || 'Start Time',
      t('endTime') || 'End Time',
      t('workTime') + ' (mins)',
      t('totalBreakTime') + ' (mins)',
      t('totalPOATime') + ' (mins)'
    ];

    const rows = sessions.map((s: any) => [
        s.date,
        new Date(s.start_time).toLocaleTimeString([], { hour12: false }),
        s.end_time ? new Date(s.end_time).toLocaleTimeString([], { hour12: false }) : 'N/A',
        s.total_work_minutes || 0,
        s.total_break_minutes || 0,
        s.total_poa_minutes || 0
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    const fileName = `WorkReport_${format(start, 'yyyyMMdd')}-${format(end, 'yyyyMMdd')}.csv`;
    const fileUri = FileSystem.documentDirectory + fileName;

    try {
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { dialogTitle: t('downloadReport'), mimeType: 'text/csv' });
    } catch (e) {
      console.error("CSV Save Error", e);
      Alert.alert(t('error'), "Could not save CSV file");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="w-11/12 bg-slate-800 rounded-lg p-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-bold text-white">{t('downloadReport')}</Text>
            <TouchableOpacity onPress={onClose}><X color="white" size={24} /></TouchableOpacity>
          </View>

          {/* Range Selection */}
          <View className="flex-row justify-around mb-4">
            {(['last_week', 'last_month', 'custom'] as ReportRange[]).map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRange(r)}
                className={`px-4 py-2 rounded-lg ${range === r ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <Text className="text-white">
                  {r === 'last_week' ? (t('previousWeek') || 'Last Week') :
                   r === 'last_month' ? (t('lastMonth') || 'Last Month') :
                   (t('customRange') || 'Custom')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {range === 'custom' && (
            <View className="flex-row justify-between mb-4">
              <TouchableOpacity onPress={() => setShowStartDatePicker(true)} className="bg-slate-700 p-3 rounded-lg flex-1 mr-2 items-center">
                <Text className="text-slate-400 text-xs">{t('date') || 'Start Date'}</Text>
                <Text className="text-white font-medium">{format(startDate, 'P')}</Text>
              </TouchableOpacity>
              {showStartDatePicker && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="default"
                  onChange={(e, d) => { setShowStartDatePicker(false); if(d) setStartDate(d); }}
                />
              )}

              <TouchableOpacity onPress={() => setShowEndDatePicker(true)} className="bg-slate-700 p-3 rounded-lg flex-1 ml-2 items-center">
                <Text className="text-slate-400 text-xs">{t('date') || 'End Date'}</Text>
                <Text className="text-white font-medium">{format(endDate, 'P')}</Text>
              </TouchableOpacity>
              {showEndDatePicker && (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="default"
                  onChange={(e, d) => { setShowEndDatePicker(false); if(d) setEndDate(d); }}
                />
              )}
            </View>
          )}

          {/* Format Selection */}
          <View className="flex-row justify-around mb-6">
            {(['pdf', 'csv'] as ReportFormat[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setReportFormat(f)}
                className={`px-4 py-2 rounded-lg ${reportFormat === f ? 'bg-green-600' : 'bg-slate-700'}`}
              >
                <Text className="text-white uppercase">{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={generateReport}
            disabled={isLoading}
            className={`p-4 rounded-lg flex-row items-center justify-center gap-2 ${isLoading ? 'bg-blue-800' : 'bg-blue-600'}`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <FileDown size={20} color="white" />
                <Text className="text-white font-bold text-lg">{t('generateReport')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
