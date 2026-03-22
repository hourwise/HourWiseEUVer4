import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, ActivityIndicator, ScrollView, TextInput, Switch } from 'react-native';
import { X, ChevronDown } from 'react-native-feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { formatCurrency } from '../lib/payCalculations';
import { useAuth } from '../providers/AuthProvider';
import { useTranslation } from 'react-i18next';
import { reportService, BusinessProfile, Client } from '../services/reportService';

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

  // Invoice specific state
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [vatRate, setVatRate] = useState('0');
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState<string>('');

  useEffect(() => {
    if (visible && user && reportType === 'invoice') {
      loadInitialData();
    }
  }, [visible, reportType]);

  const loadInitialData = async () => {
    if (!user) return;
    try {
      const data = await reportService.getReportData(user.id, startDate, endDate);
      setClients(data.clients || []);
      const nextNum = (data.businessProfile?.invoice_counter || 1).toString().padStart(4, '0');
      setManualInvoiceNumber(nextNum);
    } catch (err) {
      console.error('Failed to load initial report data:', err);
    }
  };

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

    if (reportType === 'invoice' && !selectedClientId) {
        Alert.alert(t('common.error'), t('invoiceGeneration.selectClient'));
        return;
    }

    setIsLoading(true);
    try {
      const reportData = await reportService.getReportData(user.id, start, end);

      let html = '';
      let filename = '';

      if (reportType === 'invoice') {
        if (reportData.sessions.length === 0) {
            Alert.alert(t('common.error'), t('noDataForRange'));
            setIsLoading(false);
            return;
        }
        if (!reportData.businessProfile) {
          Alert.alert(t('businessProfile.title'), t('businessProfile.setupPrompt', 'Please set up your business profile before generating an invoice.'));
          setIsLoading(false);
          return;
        } else if (!reportData.payConfig) {
            Alert.alert(t('driverSetup.title'), t('payConfig.setupPrompt', 'Please set up your pay configuration to generate an invoice.'));
            setIsLoading(false);
            return;
        }

        const selectedClient = clients.find(c => c.id === selectedClientId);
        const invNum = manualInvoiceNumber || (reportData.businessProfile.invoice_counter || 1).toString().padStart(4, '0');
        html = generateInvoiceHtml(reportData, start, end, selectedClient, invNum);
        filename = `Invoice_${invNum}_${format(start, 'yyyy-MM-dd')}.pdf`;

        // Increment invoice counter in DB
        await reportService.incrementInvoiceCounter(user.id, parseInt(invNum, 10));

      } else if (reportType === 'vehicle_check') {
        if (reportData.vehicleChecks.length === 0) {
            Alert.alert(t('common.error'), t('noDataForRange'));
            setIsLoading(false);
            return;
        }
        html = generateVehicleChecksHtml(reportData.vehicleChecks, start, end);
        filename = `Vehicle_Checks_${format(start, 'yyyy-MM-dd')}.pdf`;
      } else {
        if (reportData.sessions.length === 0) {
            Alert.alert(t('common.error'), t('noDataForRange'));
            setIsLoading(false);
            return;
        }
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

  const generateInvoiceHtml = (data: any, start: Date, end: Date, client?: Client, invoiceNum?: string) => {
    const { sessions, businessProfile, totalPay, payDetailsMap, expenses } = data;

    const workItems = Array.from(payDetailsMap.entries()).map(([date, details]: [string, any]) => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${format(new Date(date), 'PP')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">Work Shift - ${(details.paidMinutes / 60).toFixed(2)} hours</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(details.totalPay)}</td>
        </tr>
    `).join('');

    let expenseItems = '';
    let expenseTotal = 0;
    if (includeExpenses && expenses.length > 0) {
        expenseItems = expenses.map((e: any) => {
            expenseTotal += e.amount || 0;
            return `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">${format(new Date(e.date), 'PP')}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Expense: ${e.category || 'General'} - ${e.description || ''}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${formatCurrency(e.amount)}</td>
                </tr>
            `;
        }).join('');
    }

    const subtotal = totalPay + expenseTotal;
    const vatRateNum = parseFloat(vatRate);
    const vatAmount = subtotal * (vatRateNum / 100);
    const grandTotal = subtotal + vatAmount;

    return `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
                    .company-info h1 { margin: 0; color: #2563eb; font-size: 24px; }
                    .company-info p { margin: 2px 0; color: #64748b; font-size: 14px; }
                    .invoice-meta { text-align: right; }
                    .invoice-meta h2 { margin: 0; color: #1e293b; font-size: 28px; }
                    .invoice-meta p { margin: 2px 0; color: #64748b; font-size: 14px; }

                    .address-block { display: flex; justify-content: space-between; margin-bottom: 40px; gap: 40px; }
                    .address-box { flex: 1; padding: 15px; background: #f8fafc; border-radius: 8px; }
                    .address-box h3 { margin-top: 0; font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; }
                    .address-box p { margin: 2px 0; font-size: 14px; font-weight: 500; }

                    .description-box { margin-bottom: 30px; padding: 15px; border-left: 4px solid #3b82f6; background: #eff6ff; }
                    .description-box p { margin: 0; font-style: italic; color: #1e40af; }

                    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
                    th { text-align: left; padding: 12px; border-bottom: 2px solid #2563eb; color: #2563eb; font-size: 13px; text-transform: uppercase; }

                    .totals-area { margin-left: auto; width: 300px; }
                    .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
                    .total-row.grand { border-bottom: none; border-top: 2px solid #1e293b; margin-top: 5px; font-weight: bold; font-size: 1.2em; color: #1e293b; }

                    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
                    .bank-details { margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                    .bank-details p { margin: 0; color: #475569; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-info">
                        ${businessProfile.logo_url ? \`<img src="\${businessProfile.logo_url}" class="logo" />\` : ''}
                        <h1>\${businessProfile.legal_name}</h1>
                        <p>\${businessProfile.email || ''}</p>
                        <p>\${businessProfile.phone || ''}</p>
                        \${businessProfile.vat_number ? \`<p>VAT Reg: \${businessProfile.vat_number}</p>\` : ''}
                    </div>
                    <div class="invoice-meta">
                        <h2>INVOICE</h2>
                        <p><strong>Invoice #:</strong> INV-\${invoiceNum || '0001'}</p>
                        <p><strong>Date:</strong> \${format(new Date(), 'PP')}</p>
                        <p><strong>Period:</strong> \${format(start, 'PP')} - \${format(end, 'PP')}</p>
                    </div>
                </div>

                <div class="address-block">
                    <div class="address-box">
                        <h3>From</h3>
                        <p><strong>\${businessProfile.legal_name}</strong></p>
                        <p style="white-space: pre-wrap;">\${businessProfile.address || ''}</p>
                        \${businessProfile.tax_id ? \`<p>Tax ID: \${businessProfile.tax_id}</p>\` : ''}
                    </div>
                    <div class="address-box">
                        <h3>Bill To</h3>
                        <p><strong>\${client?.name || 'N/A'}</strong></p>
                        <p style="white-space: pre-wrap;">\${client?.address || ''}</p>
                        <p>\${client?.email || ''}</p>
                    </div>
                </div>

                \${invoiceDescription ? \`<div class="description-box"><p>\${invoiceDescription}</p></div>\` : ''}

                <table>
                    <thead>
                        <tr><th>Description</th><th>Details</th><th style="text-align: right;">Amount</th></tr>
                    </thead>
                    <tbody>
                        \${workItems}
                        \${expenseItems}
                    </tbody>
                </table>

                <div class="totals-area">
                    <div class="total-row"><span>Subtotal</span><span>\${formatCurrency(subtotal)}</span></div>
                    \${vatAmount > 0 ? \`<div class="total-row"><span>VAT (\${vatRate}%)</span><span>\${formatCurrency(vatAmount)}</span></div>\` : ''}
                    <div class="total-row grand"><span>Total Due</span><span>\${formatCurrency(grandTotal)}</span></div>
                </div>

                <div class="bank-details">
                    <div><strong>Bank:</strong> \${businessProfile.bank_account_name || ''}</div>
                    <div><strong>Sort Code:</strong> \${businessProfile.bank_sort_code || ''}</div>
                    <div><strong>Account #:</strong> \${businessProfile.bank_account_number || ''}</div>
                    <div><strong>IBAN:</strong> \${businessProfile.iban || ''}</div>
                </div>

                <div class="footer">
                    <p><strong>Terms:</strong> \${businessProfile.payment_terms || 'Payment due within 30 days'}</p>
                    <p>Thank you for your business.</p>
                </div>
            </body>
        </html>\`;
  };

  const generateWorkReportHtml = (sessions: any[], start: Date, end: Date) => {
    const rows = sessions.map(s => {
        const driving = s.total_driving_minutes || 0;
        const work = (s.total_work_minutes || 0) - driving;
        const breaks = s.total_break_minutes || 0;
        const poa = s.total_poa_minutes || 0;
        const total = s.total_work_minutes || 0;

        return \`
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-size: 12px;">\${format(new Date(s.start_time), 'PP')}</td>
                <td style="padding: 10px; font-size: 11px;">\${format(new Date(s.start_time), 'HH:mm')} - \${s.end_time ? format(new Date(s.end_time), 'HH:mm') : '--'}</td>
                <td style="padding: 10px; text-align: center; color: #2563eb; font-weight: bold;">\${(driving / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: center; color: #475569;">\${(work / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: center; color: #10b981;">\${(breaks / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: center; color: #f59e0b;">\${(poa / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: right; font-weight: bold;">\${(total / 60).toFixed(2)}h</td>
            </tr>
        \`;
    }).join('');

    return \`
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 30px; color: #1e293b; }
                    h1 { color: #1e293b; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-bottom: 5px; }
                    .period { color: #64748b; margin-bottom: 30px; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { text-align: center; padding: 12px; background-color: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
                    .summary { margin-top: 40px; border-top: 2px solid #1e293b; padding-top: 20px; }
                    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; text-align: center; }
                    .stat-box h4 { margin: 0; font-size: 10px; color: #94a3b8; text-transform: uppercase; }
                    .stat-box p { margin: 5px 0 0; font-size: 18px; font-weight: bold; color: #1e293b; }
                </style>
            </head>
            <body>
                <h1>Driver Compliance & Work Record</h1>
                <div class="period">Reporting Period: \${format(start, 'PP')} to \${format(end, 'PP')}</div>

                <table>
                    <thead>
                        <tr>
                            <th style="text-align: left;">Date</th>
                            <th style="text-align: left;">Shift Time</th>
                            <th>Driving</th>
                            <th>Work</th>
                            <th>Break</th>
                            <th>POA</th>
                            <th style="text-align: right;">Total Work</th>
                        </tr>
                    </thead>
                    <tbody>\${rows}</tbody>
                </table>

                <div class="summary">
                    <div class="summary-grid">
                        <div class="stat-box"><h4>Total Driving</h4><p>\${(sessions.reduce((sum, s) => sum + (s.total_driving_minutes || 0), 0) / 60).toFixed(2)}h</p></div>
                        <div class="stat-box"><h4>Total Break</h4><p>\${(sessions.reduce((sum, s) => sum + (s.total_break_minutes || 0), 0) / 60).toFixed(2)}h</p></div>
                        <div class="stat-box"><h4>Total POA</h4><p>\${(sessions.reduce((sum, s) => sum + (s.total_poa_minutes || 0), 0) / 60).toFixed(2)}h</p></div>
                        <div class="stat-box"><h4>Total Period Work</h4><p style="color: #10b981;">\${(sessions.reduce((sum, s) => sum + (s.total_work_minutes || 0), 0) / 60).toFixed(2)}h</p></div>
                    </div>
                </div>
            </body>
        </html>\`;
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
        <View className="w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-h-[90%]">
          <View className="flex-row justify-between items-center p-6 border-b border-slate-700">
            <Text className="text-white text-2xl font-bold">{t('menu.downloadReport')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2"><X color="white" size={24} /></TouchableOpacity>
          </View>

          <ScrollView className="p-6">
            {/* Report Type Toggle */}
            <View className="flex-row bg-slate-900 rounded-xl p-1.5 mb-6">
              <TouchableOpacity onPress={() => setReportType('report')} className={`flex-1 py-2.5 rounded-lg \${reportType === 'report' ? 'bg-emerald-600' : ''}`}><Text className="text-white text-center font-bold text-xs">{t('workReport')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setReportType('invoice')} className={`flex-1 py-2.5 rounded-lg \${reportType === 'invoice' ? 'bg-blue-600' : ''}`}><Text className="text-white text-center font-bold text-xs">{t('invoice')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setReportType('vehicle_check')} className={`flex-1 py-2.5 rounded-lg \${reportType === 'vehicle_check' ? 'bg-amber-600' : ''}`}><Text className="text-white text-center font-bold text-xs">VEHICLE CHECKS</Text></TouchableOpacity>
            </View>

            {/* Date Range Selection */}
            <View className="flex-row justify-around mb-6 bg-slate-700/50 py-3 rounded-xl">
                <TouchableOpacity onPress={() => setRange('last_week')}><Text className={`font-bold \${range === 'last_week' ? 'text-blue-400' : 'text-slate-400'}`}>{t('previousWeek')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setRange('last_month')}><Text className={`font-bold \${range === 'last_month' ? 'text-blue-400' : 'text-slate-400'}`}>{t('lastMonth')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setRange('custom')}><Text className={`font-bold \${range === 'custom' ? 'text-blue-400' : 'text-slate-400'}`}>{t('customRange')}</Text></TouchableOpacity>
            </View>

            {range === 'custom' && (
                <View className="flex-row justify-between mb-6">
                    <TouchableOpacity onPress={() => setShowPicker('start')} className="bg-slate-700 p-3 rounded-xl w-[48%] border border-slate-600"><Text className="text-slate-400 text-xs mb-1 text-center">START</Text><Text className="text-white text-center font-bold">{format(startDate, 'PP')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowPicker('end')} className="bg-slate-700 p-3 rounded-xl w-[48%] border border-slate-600"><Text className="text-slate-400 text-xs mb-1 text-center">END</Text><Text className="text-white text-center font-bold">{format(endDate, 'PP')}</Text></TouchableOpacity>
                </View>
            )}

            {showPicker && <DateTimePicker value={showPicker === 'start' ? startDate : endDate} mode="date" display="default" onChange={onDateChange} />}

            {/* Invoice Options */}
            {reportType === 'invoice' && (
                <View className="space-y-4 mb-6">
                    <View>
                        <Text className="text-slate-400 text-xs font-bold uppercase mb-2">Invoice Number</Text>
                        <TextInput
                            value={manualInvoiceNumber}
                            onChangeText={setManualInvoiceNumber}
                            keyboardType="numeric"
                            placeholder="0001"
                            placeholderTextColor="#64748b"
                            className="bg-slate-700 p-3 rounded-xl text-white border border-slate-600 font-bold"
                        />
                    </View>

                    <View>
                        <Text className="text-slate-400 text-xs font-bold uppercase mb-2">{t('invoiceGeneration.selectClient')}</Text>
                        <View className="bg-slate-700 rounded-xl overflow-hidden border border-slate-600">
                            {clients.length === 0 ? (
                                <Text className="text-slate-500 p-3 italic">No clients found. Add them in Business Profile.</Text>
                            ) : (
                                <View>
                                    {clients.map(client => (
                                        <TouchableOpacity
                                            key={client.id}
                                            onPress={() => setSelectedClientId(client.id)}
                                            className={`p-3 border-b border-slate-600 flex-row justify-between items-center \${selectedClientId === client.id ? 'bg-blue-600/20' : ''}`}
                                        >
                                            <Text className="text-white font-medium">{client.name}</Text>
                                            {selectedClientId === client.id && <View className="w-2 h-2 rounded-full bg-blue-400" />}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>

                    <View>
                        <Text className="text-slate-400 text-xs font-bold uppercase mb-2">{t('invoiceGeneration.description')}</Text>
                        <TextInput
                            value={invoiceDescription}
                            onChangeText={setInvoiceDescription}
                            placeholder="e.g. Weekly trunking services"
                            placeholderTextColor="#64748b"
                            className="bg-slate-700 p-3 rounded-xl text-white border border-slate-600"
                        />
                    </View>

                    <View className="flex-row items-center justify-between bg-slate-700 p-3 rounded-xl border border-slate-600">
                        <Text className="text-white font-medium">{t('invoiceGeneration.includeExpenses')}</Text>
                        <Switch value={includeExpenses} onValueChange={setIncludeExpenses} />
                    </View>

                    <View>
                        <Text className="text-slate-400 text-xs font-bold uppercase mb-2">{t('invoiceGeneration.vatRate')}</Text>
                        <View className="flex-row gap-2">
                            {['0', '5', '20'].map(rate => (
                                <TouchableOpacity
                                    key={rate}
                                    onPress={() => setVatRate(rate)}
                                    className={`flex-1 p-3 rounded-xl border \${vatRate === rate ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600'}`}
                                >
                                    <Text className="text-white text-center font-bold">{rate}%</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            )}

            <TouchableOpacity onPress={generateReport} disabled={isLoading} className={`p-4 rounded-xl flex-row items-center justify-center shadow-lg mb-8 \${reportType === 'report' ? 'bg-emerald-600' : reportType === 'invoice' ? 'bg-blue-600' : 'bg-amber-600'}`}>
              {isLoading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{t('generateReport')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
