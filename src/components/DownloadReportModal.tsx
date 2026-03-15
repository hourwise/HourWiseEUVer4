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
import { reportService, BusinessProfile } from '../services/reportService';

interface DownloadReportModalProps {
  onClose: () => void;
  visible: boolean;
}

type ReportRange = 'last_week' | 'last_month' | 'custom';
type ReportType = 'report' | 'invoice' | 'vehicle_check';

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

      let html = '';
      let filename = '';

      if (reportType === 'invoice') {
        if (!reportData.businessProfile) {
          Alert.alert(t('businessProfile.title'), t('businessProfile.setupPrompt', 'Please set up your business profile before generating an invoice.'));
          return;
        } else if (!reportData.payConfig) {
            Alert.alert(t('driverSetup.title'), t('payConfig.setupPrompt', 'Please set up your pay configuration to generate an invoice.'));
            return;
        }
        html = generateInvoiceHtml(reportData.sessions, start, end, reportData.businessProfile, reportData.totalPay, reportData.payDetailsMap);
        filename = `Invoice_${format(start, 'yyyy-MM-dd')}.pdf`;
      } else if (reportType === 'vehicle_check') {
        html = generateVehicleChecksHtml(reportData.vehicleChecks, start, end);
        filename = `Vehicle_Checks_${format(start, 'yyyy-MM-dd')}.pdf`;
      } else {
        html = generateWorkReportHtml(reportData.sessions, start, end);
        filename = `Work_Report_${format(start, 'yyyy-MM-dd')}.pdf`;
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { dialogTitle: t('menu.downloadReport'), mimeType: 'application/pdf' });

    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('failedToGenerate'));
    } finally {
      setIsLoading(false);
    }
  };

  const generateVehicleChecksHtml = (checks: any[], start: Date, end: Date) => {
    const rows = checks.map(c => {
        const date = format(new Date(c.created_at), 'PPpp');
        const driver = c.profiles?.full_name || 'Unknown';
        const status = c.check_status === 'defect' ? '<span style="color: red; font-weight: bold;">DEFECT</span>' : '<span style="color: green; font-weight: bold;">PASS</span>';

        return `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${date}</td>
                <td style="padding: 8px;">${c.reg_number} (${c.vehicle_type})</td>
                <td style="padding: 8px;">${driver}</td>
                <td style="padding: 8px;">${status}</td>
                <td style="padding: 8px;">${c.defect_details || '-'}</td>
                <td style="padding: 8px;">${c.odometer_reading || '-'}</td>
            </tr>
        `;
    }).join('');

    return `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    h1 { color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background-color: #f8fafc; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; }
                    .header-info { margin-bottom: 20px; color: #64748b; }
                </style>
            </head>
            <body>
                <h1>Vehicle Walkaround Report</h1>
                <div class="header-info">
                    <p><strong>Driver:</strong> ${checks[0]?.profiles?.full_name || 'N/A'}</p>
                    <p><strong>Period:</strong> ${format(start, 'PP')} to ${format(end, 'PP')}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Date & Time</th>
                            <th>Vehicle (Reg)</th>
                            <th>Inspector</th>
                            <th>Status</th>
                            <th>Defect Details</th>
                            <th>Odometer</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </body>
        </html>`;
  };

  const generateInvoiceHtml = (sessions: any[], start: Date, end: Date, businessProfile: BusinessProfile, totalPay: number, payDetailsMap: Map<string, any>) => {
    const lineItems = Array.from(payDetailsMap.entries()).map(([date, details]) => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${format(new Date(date), 'PP')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${(details.paidMinutes / 60).toFixed(2)} hours</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(details.totalPay)}</td>
        </tr>
    `).join('');

    return `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 40px; color: #333; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .company-info h1 { margin: 0; color: #2563eb; }
                    .company-info p { margin: 2px 0; color: #666; }
                    .invoice-details { text-align: right; }
                    .invoice-details h2 { margin: 0; color: #333; }
                    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
                    th { text-align: left; padding: 12px; border-bottom: 2px solid #2563eb; color: #2563eb; }
                    .total { text-align: right; font-size: 1.2em; font-weight: bold; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-info">
                        <h1>${businessProfile.legal_name}</h1>
                        <p>${businessProfile.address || ''}</p>
                        <p>${businessProfile.email || ''}</p>
                        <p>${businessProfile.phone || ''}</p>
                    </div>
                    <div class="invoice-details">
                        <h2>INVOICE</h2>
                        <p>Date: ${format(new Date(), 'PP')}</p>
                        <p>Period: ${format(start, 'PP')} - ${format(end, 'PP')}</p>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr><th>Date</th><th>Duration</th><th style="text-align: right;">Amount</th></tr>
                    </thead>
                    <tbody>${lineItems}</tbody>
                </table>
                <div class="total">
                    Total Due: ${formatCurrency(totalPay)}
                </div>
            </body>
        </html>`;
  };

  const generateWorkReportHtml = (sessions: any[], start: Date, end: Date) => {
    const totalWork = sessions.reduce((sum, s) => sum + (s.total_work_minutes || 0), 0);
    const lineItems = sessions.map(s => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px;">${format(new Date(s.start_time), 'PPpp')}</td>
            <td style="padding: 10px;">${s.end_time ? format(new Date(s.end_time), 'PPpp') : 'Ongoing'}</td>
            <td style="padding: 10px; text-align: right;">${(s.total_work_minutes / 60).toFixed(2)} hrs</td>
        </tr>
    `).join('');

    return `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 30px; }
                    h1 { color: #1e293b; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { text-align: left; padding: 12px; background-color: #ecfdf5; color: #065f46; }
                    .summary { margin-top: 30px; padding: 20px; background-color: #f8fafc; border-radius: 8px; text-align: right; }
                </style>
            </head>
            <body>
                <h1>Work Compliance Report</h1>
                <p><strong>Period:</strong> ${format(start, 'PP')} to ${format(end, 'PP')}</p>
                <table>
                    <thead>
                        <tr><th>Shift Start</th><th>Shift End</th><th style="text-align: right;">Total Work</th></tr>
                    </thead>
                    <tbody>${lineItems}</tbody>
                </table>
                <div class="summary">
                    <p style="font-size: 1.2em;"><strong>Total Period Work:</strong> ${(totalWork / 60).toFixed(2)} hours</p>
                </div>
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
        <View className="w-full bg-slate-800 rounded-lg p-6 shadow-2xl border border-slate-700">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-white text-2xl font-bold">{t('menu.downloadReport')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2"><X color="white" size={24} /></TouchableOpacity>
          </View>

          {/* Report Type Toggle */}
          <View className="flex-row bg-slate-900 rounded-xl p-1.5 mb-6">
            <TouchableOpacity onPress={() => setReportType('report')} className={`flex-1 py-2.5 rounded-lg ${reportType === 'report' ? 'bg-emerald-600' : ''}`}><Text className="text-white text-center font-bold text-xs">{t('workReport')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setReportType('invoice')} className={`flex-1 py-2.5 rounded-lg ${reportType === 'invoice' ? 'bg-blue-600' : ''}`}><Text className="text-white text-center font-bold text-xs">{t('invoice')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setReportType('vehicle_check')} className={`flex-1 py-2.5 rounded-lg ${reportType === 'vehicle_check' ? 'bg-amber-600' : ''}`}><Text className="text-white text-center font-bold text-xs">VEHICLE CHECKS</Text></TouchableOpacity>
          </View>

          {/* Date Range Selection */}
          <View className="flex-row justify-around mb-6 bg-slate-700/50 py-3 rounded-xl">
              <TouchableOpacity onPress={() => setRange('last_week')}><Text className={`font-bold ${range === 'last_week' ? 'text-blue-400' : 'text-slate-400'}`}>{t('previousWeek')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setRange('last_month')}><Text className={`font-bold ${range === 'last_month' ? 'text-blue-400' : 'text-slate-400'}`}>{t('lastMonth')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setRange('custom')}><Text className={`font-bold ${range === 'custom' ? 'text-blue-400' : 'text-slate-400'}`}>{t('customRange')}</Text></TouchableOpacity>
          </View>

          {range === 'custom' && (
              <View className="flex-row justify-between mb-6">
                  <TouchableOpacity onPress={() => setShowPicker('start')} className="bg-slate-700 p-3 rounded-xl w-[48%] border border-slate-600"><Text className="text-slate-400 text-xs mb-1 text-center">START</Text><Text className="text-white text-center font-bold">{format(startDate, 'PP')}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowPicker('end')} className="bg-slate-700 p-3 rounded-xl w-[48%] border border-slate-600"><Text className="text-slate-400 text-xs mb-1 text-center">END</Text><Text className="text-white text-center font-bold">{format(endDate, 'PP')}</Text></TouchableOpacity>
              </View>
          )}

          {showPicker && <DateTimePicker value={showPicker === 'start' ? startDate : endDate} mode="date" display="default" onChange={onDateChange} />}

          <TouchableOpacity onPress={generateReport} disabled={isLoading} className={`p-4 rounded-xl flex-row items-center justify-center shadow-lg ${reportType === 'report' ? 'bg-emerald-600' : reportType === 'invoice' ? 'bg-blue-600' : 'bg-amber-600'}`}>
            {isLoading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{t('generateReport')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
