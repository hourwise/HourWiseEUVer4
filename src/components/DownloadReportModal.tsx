import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, ActivityIndicator, Platform } from 'react-native';
import { X } from 'react-native-feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { formatCurrency } from '../lib/payCalculations';
import { useAuth } from '../providers/AuthProvider';
import { useTranslation } from 'react-i18next';
import { reportService, BusinessProfile } from '../services/reportService'; // Import the new service

interface DownloadReportModalProps {
  onClose: () => void;
  visible: boolean;
}

type ReportRange = 'last_week' | 'last_month' | 'custom';
type ReportType = 'report' | 'invoice';

export default function DownloadReportModal({ onClose, visible }: DownloadReportModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [reportType, setReportType] = useState<ReportType>('report');
  const [range, setRange] = useState<ReportRange>('last_week');
  const [startDate, setStartDate] = useState(() => subWeeks(startOfWeek(new Date()), 1));
  const [endDate, setEndDate] = useState(() => subWeeks(endOfWeek(new Date()), 1));
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getRangeDates = () => {
    const now = new Date();
    switch (range) {
      case 'last_week':
        return { start: subWeeks(startOfWeek(now), 1), end: subWeeks(endOfWeek(now), 1) };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'custom':
        return { start: startDate, end: endDate };
    }
  };

  const generateReport = async () => {
    if (!user) return;
    const { start, end } = getRangeDates();
    if (range === 'custom' && end < start) {
      Alert.alert(t('common.error'), t('dateRangeError'));
      return;
    }

    setIsLoading(true);
    try {
      const reportData = await reportService.getReportData(user.id, start, end);

      if (reportType === 'invoice') {
        if (!reportData.businessProfile) {
          Alert.alert(t('businessProfile.title'), t('businessProfile.setupPrompt', 'Please set up your business profile before generating an invoice.'));
        } else if (!reportData.payConfig) {
            Alert.alert(t('driverSetup.title'), t('payConfig.setupPrompt', 'Please set up your pay configuration to generate an invoice.'))
        } else {
          const html = generateInvoiceHtml(reportData.sessions, start, end, reportData.businessProfile, reportData.totalPay, reportData.payDetailsMap);
          const { uri } = await Print.printToFileAsync({ html, base64: false });
          await Sharing.shareAsync(uri, { dialogTitle: 'Share Invoice', mimeType: 'application/pdf' });
        }
      } else {
        const html = generateWorkReportHtml(reportData.sessions, start, end);
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        await Sharing.shareAsync(uri, { dialogTitle: 'Share Work Report', mimeType: 'application/pdf' });
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('failedToGenerate'));
    } finally {
      setIsLoading(false);
    }
  };

  // All HTML generation is now pure functions, making them easier to test/manage.
  const generateInvoiceHtml = (sessions: any[], start: Date, end: Date, businessProfile: BusinessProfile, totalPay: number, payDetailsMap: Map<string, any>) => {
    const lineItems = Array.from(payDetailsMap.entries()).map(([date, details]) => `
        <tr>
            <td>${format(new Date(date), 'PP')}</td>
            <td>${(details.paidMinutes / 60).toFixed(2)} hours</td>
            <td>${formatCurrency(details.totalPay)}</td>
        </tr>
    `).join('');

    return `
        <html>
            <head><style>/* CSS for invoice */</style></head>
            <body>
                <header>
                    ${businessProfile.logo_url ? `<img src="${businessProfile.logo_url}" alt="logo" width="150">` : `<h1>${businessProfile.legal_name}</h1>`}
                    <h2>Invoice</h2>
                </header>
                <main>
                    <p><strong>Period:</strong> ${format(start, 'PP')} to ${format(end, 'PP')}</p>
                    <table>
                        <thead><tr><th>Date</th><th>Work Duration</th><th>Amount</th></tr></thead>
                        <tbody>${lineItems}</tbody>
                        <tfoot><tr><td colspan="2">Total</td><td>${formatCurrency(totalPay)}</td></tr></tfoot>
                    </table>
                </main>
            </body>
        </html>`;
  };

  const generateWorkReportHtml = (sessions: any[], start: Date, end: Date) => {
    const totalWork = sessions.reduce((sum, s) => sum + (s.total_work_minutes || 0), 0);
    const lineItems = sessions.map(s => `
        <tr>
            <td>${format(new Date(s.start_time), 'PPpp')}</td>
            <td>${s.end_time ? format(new Date(s.end_time), 'PPpp') : 'Ongoing'}</td>
            <td>${(s.total_work_minutes / 60).toFixed(2)} hours</td>
        </tr>
    `).join('');

    return `
        <html>
            <head><style>/* CSS for report */</style></head>
            <body>
                <h1>Work Report</h1>
                <p><strong>Period:</strong> ${format(start, 'PP')} to ${format(end, 'PP')}</p>
                <table>
                    <thead><tr><th>Start</th><th>End</th><th>Duration</th></tr></thead>
                    <tbody>${lineItems}</tbody>
                    <tfoot><tr><td colspan="2">Total Work</td><td>${(totalWork / 60).toFixed(2)} hours</td></tr><tfoot>
                </table>
            </body>
        </html>`;
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || (showPicker === 'start' ? startDate : endDate);
    setShowPicker(null);
    if (showPicker === 'start') setStartDate(currentDate);
    else setEndDate(currentDate);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/50 p-4">
        <View className="w-full bg-slate-800 rounded-lg p-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white text-xl font-bold">{t('menu.downloadReport')}</Text>
            <TouchableOpacity onPress={onClose}><X color="white" /></TouchableOpacity>
          </View>

          {/* Report Type Toggle */}
          <View className="flex-row bg-slate-700 rounded-lg p-1 mb-4">
            <TouchableOpacity onPress={() => setReportType('report')} className={`flex-1 p-2 rounded-md ${reportType === 'report' ? 'bg-blue-600' : ''}`}><Text className="text-white text-center font-semibold">{t('workReport')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setReportType('invoice')} className={`flex-1 p-2 rounded-md ${reportType === 'invoice' ? 'bg-blue-600' : ''}`}><Text className="text-white text-center font-semibold">{t('invoice')}</Text></TouchableOpacity>
          </View>

          {/* Date Range Selection */}
          <View className="flex-row justify-around mb-4">
              <TouchableOpacity onPress={() => setRange('last_week')}><Text className={`font-semibold ${range === 'last_week' ? 'text-blue-400' : 'text-slate-400'}`}>{t('previousWeek')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setRange('last_month')}><Text className={`font-semibold ${range === 'last_month' ? 'text-blue-400' : 'text-slate-400'}`}>{t('lastMonth')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setRange('custom')}><Text className={`font-semibold ${range === 'custom' ? 'text-blue-400' : 'text-slate-400'}`}>{t('customRange')}</Text></TouchableOpacity>
          </View>

          {range === 'custom' && (
              <View className="flex-row justify-between mb-4">
                  <TouchableOpacity onPress={() => setShowPicker('start')} className="bg-slate-700 p-2 rounded w-[48%]"><Text className="text-white text-center">{format(startDate, 'PP')}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowPicker('end')} className="bg-slate-700 p-2 rounded w-[48%]"><Text className="text-white text-center">{format(endDate, 'PP')}</Text></TouchableOpacity>
              </View>
          )}

          {showPicker && <DateTimePicker value={showPicker === 'start' ? startDate : endDate} mode="date" display="default" onChange={onDateChange} />}

          <TouchableOpacity onPress={generateReport} disabled={isLoading} className="bg-green-600 p-4 rounded-lg flex-row items-center justify-center">
            {isLoading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{t('generateReport')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
