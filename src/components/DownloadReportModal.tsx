import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, ActivityIndicator, ScrollView, TextInput, Switch } from 'react-native';
import { X, ChevronDown, Plus, Trash } from 'react-native-feather';
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

interface ManualLineItem {
  description: string;
  amount: string;
}

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
  const [manualLineItems, setManualLineItems] = useState<ManualLineItem[]>([]);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  useEffect(() => {
    if (visible && user) {
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

  const addManualLineItem = () => {
    setManualLineItems([...manualLineItems, { description: '', amount: '' }]);
  };

  const removeManualLineItem = (index: number) => {
    const newItems = [...manualLineItems];
    newItems.splice(index, 1);
    setManualLineItems(newItems);
  };

  const updateManualLineItem = (index: number, field: keyof ManualLineItem, value: string) => {
    const newItems = [...manualLineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setManualLineItems(newItems);
  };

  const calculateInvoiceLineItems = (
    sessions: any[],
    shiftJobs: any[],
    client: Client,
    expenses: any[],
    includeExpenses: boolean
  ) => {
    const lineItems: {description: string, quantity: string, unitPrice: number, total: number}[] = [];

    // Hourly billing
    if (client.hourly_rate && (client.billing_types || []).includes('hourly')) {
      const totalPaidMinutes = sessions.reduce((sum, s) => {
        // Assume all work minutes are paid for now (could subtract unpaid breaks if implemented)
        return sum + (s.total_work_minutes || 0);
      }, 0);
      const hours = totalPaidMinutes / 60;
      if (hours > 0) {
        lineItems.push({
          description: 'Driving & Working Time',
          quantity: `${hours.toFixed(2)} hrs`,
          unitPrice: client.hourly_rate,
          total: hours * client.hourly_rate
        });
      }
    }

    // Daily rate billing
    if (client.daily_rate && (client.billing_types || []).includes('daily')) {
      const workingDays = sessions.length;
      if (workingDays > 0) {
        lineItems.push({
          description: 'Daily Rate',
          quantity: `${workingDays} day${workingDays !== 1 ? 's' : ''}`,
          unitPrice: client.daily_rate,
          total: workingDays * client.daily_rate
        });
      }
    }

    // Night out
    if (client.night_out_rate) {
      const nightOuts = shiftJobs.filter(j => j.night_out).length;
      if (nightOuts > 0) {
        lineItems.push({
          description: 'Night Out Allowance',
          quantity: `${nightOuts} night${nightOuts !== 1 ? 's' : ''}`,
          unitPrice: client.night_out_rate,
          total: nightOuts * client.night_out_rate
        });
      }
    }

    // PPM
    if (client.ppm_loaded_rate && (client.billing_types || []).includes('ppm')) {
      const totalLoadedMiles = shiftJobs.reduce((sum, j) => sum + (j.loaded_miles || 0), 0);
      if (totalLoadedMiles > 0) {
        const loadedTotal = totalLoadedMiles * (client.ppm_loaded_rate / 100);
        lineItems.push({
          description: 'Loaded Mileage',
          quantity: `${totalLoadedMiles.toFixed(0)} miles @ ${client.ppm_loaded_rate}ppm`,
          unitPrice: client.ppm_loaded_rate / 100,
          total: loadedTotal
        });
      }
    }

    if (client.ppm_empty_rate && (client.billing_types || []).includes('ppm')) {
      const totalEmptyMiles = shiftJobs.reduce((sum, j) => sum + (j.empty_miles || 0), 0);
      if (totalEmptyMiles > 0) {
        const emptyTotal = totalEmptyMiles * (client.ppm_empty_rate / 100);
        lineItems.push({
          description: 'Empty Running',
          quantity: `${totalEmptyMiles.toFixed(0)} miles @ ${client.ppm_empty_rate}ppm`,
          unitPrice: client.ppm_empty_rate / 100,
          total: emptyTotal
        });
      }
    }

    // Fuel surcharge on mileage
    if (client.fuel_surcharge_pct && client.fuel_surcharge_pct > 0) {
      const mileageTotal = lineItems
        .filter(i => i.description.includes('Mileage') || i.description.includes('Running'))
        .reduce((sum, i) => sum + i.total, 0);
      if (mileageTotal > 0) {
        const surcharge = mileageTotal * (client.fuel_surcharge_pct / 100);
        lineItems.push({
          description: `Fuel Surcharge (${client.fuel_surcharge_pct}%)`,
          quantity: '',
          unitPrice: surcharge,
          total: surcharge
        });
      }
    }

    // Waiting time
    if (client.waiting_time_rate) {
      const totalWaitingMins = shiftJobs.reduce((sum, j) => sum + (j.waiting_minutes || 0), 0);
      const freeMinutes = (client.waiting_time_free_minutes || 60) * (shiftJobs.length || sessions.length || 1);
      const chargeableMins = Math.max(0, totalWaitingMins - freeMinutes);
      if (chargeableMins > 0) {
        const waitingHours = chargeableMins / 60;
        lineItems.push({
          description: 'Waiting Time',
          quantity: `${chargeableMins} mins @ £${client.waiting_time_rate}/hr`,
          unitPrice: client.waiting_time_rate,
          total: waitingHours * client.waiting_time_rate
        });
      }
    }

    // Custom line items from client rate card
    if (Array.isArray(client.custom_line_items)) {
      client.custom_line_items.forEach((item: any) => {
        lineItems.push({
          description: item.description,
          quantity: item.unit,
          unitPrice: item.amount,
          total: item.amount
        });
      });
    }

    // Manual Line Items
    manualLineItems.forEach(item => {
        const amount = parseFloat(item.amount) || 0;
        if (item.description && amount !== 0) {
            lineItems.push({
                description: item.description,
                quantity: '-',
                unitPrice: amount,
                total: amount
            });
        }
    });

    // Expenses
    if (includeExpenses) {
      expenses.forEach(e => {
        lineItems.push({
          description: `Expense: ${e.category || 'General'} — ${e.description || ''}`,
          quantity: '',
          unitPrice: e.amount,
          total: e.amount
        });
      });
    }

    return lineItems;
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
        }

        const selectedClient = clients.find(c => c.id === selectedClientId);
        const invNum = manualInvoiceNumber || (reportData.businessProfile.invoice_counter || 1).toString().padStart(4, '0');

        const lineItems = calculateInvoiceLineItems(
          reportData.sessions,
          reportData.shiftJobs,
          selectedClient!,
          reportData.expenses,
          includeExpenses
        );

        html = generateInvoiceHtml(reportData, start, end, selectedClient, invNum, lineItems);
        filename = `Invoice_${invNum}_${format(start, 'yyyy-MM-dd')}.pdf`;

        // Increment invoice counter in DB using the manually entered number
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

  const generateInvoiceHtml = (data: any, start: Date, end: Date, client: Client | undefined, invoiceNum: string, lineItems: any[]) => {
    const { businessProfile } = data;

    const tableRows = lineItems.map(item => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.description}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unitPrice)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrency(item.total)}</td>
        </tr>
    `).join('');

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
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
                    th { text-align: left; padding: 12px; border-bottom: 2px solid #2563eb; color: #2563eb; font-size: 11px; text-transform: uppercase; }

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
                        ${businessProfile.logo_url ? `<img src="${businessProfile.logo_url}" class="logo" />` : ''}
                        <h1>${businessProfile.legal_name}</h1>
                        <p>${businessProfile.email || ''}</p>
                        <p>${businessProfile.phone || ''}</p>
                        ${businessProfile.vat_number ? `<p>VAT Reg: ${businessProfile.vat_number}</p>` : ''}
                    </div>
                    <div class="invoice-meta">
                        <h2>INVOICE</h2>
                        <p><strong>Invoice #:</strong> INV-${invoiceNum}</p>
                        <p><strong>Date:</strong> ${format(new Date(), 'PP')}</p>
                        <p><strong>Period:</strong> ${format(start, 'PP')} - ${format(end, 'PP')}</p>
                    </div>
                </div>

                <div class="address-block">
                    <div class="address-box">
                        <h3>From</h3>
                        <p><strong>${businessProfile.legal_name}</strong></p>
                        <p style="white-space: pre-wrap;">${businessProfile.address || ''}</p>
                        ${businessProfile.tax_id ? `<p>Tax ID: ${businessProfile.tax_id}</p>` : ''}
                    </div>
                    <div class="address-box">
                        <h3>Bill To</h3>
                        <p><strong>${client?.name || 'N/A'}</strong></p>
                        <p style="white-space: pre-wrap;">${client?.address || ''}</p>
                        <p>${client?.email || ''}</p>
                    </div>
                </div>

                ${invoiceDescription ? `<div class="description-box"><p>${invoiceDescription}</p></div>` : ''}

                <table>
                    <thead>
                        <tr><th>Description</th><th>Qty/Details</th><th style="text-align: right;">Unit Price</th><th style="text-align: right;">Total</th></tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <div class="totals-area">
                    <div class="total-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                    ${vatAmount > 0 ? `<div class="total-row"><span>VAT (${vatRate}%)</span><span>${formatCurrency(vatAmount)}</span></div>` : ''}
                    <div class="total-row grand"><span>Total Due</span><span>${formatCurrency(grandTotal)}</span></div>
                </div>

                <div class="bank-details">
                    <div><strong>Bank:</strong> ${businessProfile.bank_account_name || ''}</div>
                    <div><strong>Sort Code:</strong> ${businessProfile.bank_sort_code || ''}</div>
                    <div><strong>Account #:</strong> ${businessProfile.bank_account_number || ''}</div>
                    <div><strong>IBAN:</strong> ${businessProfile.iban || ''}</div>
                </div>

                <div class="footer">
                    <p><strong>Terms:</strong> ${client?.payment_terms || businessProfile.payment_terms || 'Payment due within 30 days'}</p>
                    <p>Thank you for your business.</p>
                </div>
            </body>
        </html>`;
  };

  const generateWorkReportHtml = (sessions: any[], start: Date, end: Date) => {
    const rows = sessions.map(s => {
        const driving = s.total_driving_minutes || 0;
        const work = (s.total_work_minutes || 0) - driving;
        const breaks = s.total_break_minutes || 0;
        const poa = s.total_poa_minutes || 0;
        const total = s.total_work_minutes || 0;

        return `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-size: 12px;">${format(new Date(s.start_time), 'PP')}</td>
                <td style="padding: 10px; font-size: 11px;">${format(new Date(s.start_time), 'HH:mm')} - ${s.end_time ? format(new Date(s.end_time), 'HH:mm') : '--'}</td>
                <td style="padding: 10px; text-align: center; color: #2563eb; font-weight: bold;">${(driving / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: center; color: #475569;">${(work / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: center; color: #10b981;">${(breaks / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: center; color: #f59e0b;">${(poa / 60).toFixed(2)}h</td>
                <td style="padding: 10px; text-align: right; font-weight: bold;">${(total / 60).toFixed(2)}h</td>
            </tr>
        `;
    }).join('');

    return `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 30px; color: #1e293b; }
                    h1 { color: #1e293b; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { text-align: left; padding: 12px; border-bottom: 2px solid #eee; color: #64748b; font-size: 11px; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <h1>Work Compliance Report</h1>
                <p>Period: ${format(start, 'PP')} - ${format(end, 'PP')}</p>
                <table>
                    <thead>
                        <tr><th>Date</th><th>Times</th><th style="text-align: center;">Driving</th><th style="text-align: center;">Work</th><th style="text-align: center;">Break</th><th style="text-align: center;">POA</th><th style="text-align: right;">Total Work</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </body>
        </html>`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/60 p-4">
        <View className="bg-white rounded-2xl w-full" style={{ maxHeight: '90%' }}>
          <View className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex-row justify-between items-center rounded-t-2xl">
            <Text className="text-xl font-bold text-gray-900">{t('menu.downloadReport')}</Text>
            <TouchableOpacity onPress={onClose} className="p-1"><X size={24} color="#64748b" /></TouchableOpacity>
          </View>

          <ScrollView className="p-6">
            <View className="space-y-6">

              {/* Report Type Selector */}
              <View>
                <Text className="text-sm font-bold text-gray-500 uppercase mb-3 tracking-wider">{t('reportType')}</Text>
                <View className="flex-row gap-2">
                  {[
                    { id: 'report', label: t('workReport') },
                    { id: 'invoice', label: t('invoice') },
                    { id: 'vehicle_check', label: t('dashboard.checkVehicle') }
                  ].map(type => (
                    <TouchableOpacity
                      key={type.id}
                      onPress={() => setReportType(type.id as ReportType)}
                      className={`flex-1 p-3 rounded-xl border-2 ${reportType === type.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-100'}`}
                    >
                      <Text className={`text-center font-bold text-xs ${reportType === type.id ? 'text-white' : 'text-gray-600'}`}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Range Selector */}
              <View>
                <Text className="text-sm font-bold text-gray-500 uppercase mb-3 tracking-wider">{t('dateRange')}</Text>
                <View className="flex-row gap-2 mb-3">
                  {[
                    { id: 'last_week', label: t('previousWeek') },
                    { id: 'last_month', label: t('lastMonth') },
                    { id: 'custom', label: t('customRange') }
                  ].map(r => (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => setRange(r.id as ReportRange)}
                      className={`flex-1 p-3 rounded-xl border-2 ${range === r.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-100'}`}
                    >
                      <Text className={`text-center font-bold text-xs ${range === r.id ? 'text-white' : 'text-gray-600'}`}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {range === 'custom' && (
                  <View className="flex-row gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <TouchableOpacity onPress={() => setShowPicker('start')} className="flex-1">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('common.date')} From</Text>
                      <Text className="text-sm font-bold text-gray-700">{format(startDate, 'PP')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowPicker('end')} className="flex-1">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('common.date')} To</Text>
                      <Text className="text-sm font-bold text-gray-700">{format(endDate, 'PP')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Invoice Specific Fields */}
              {reportType === 'invoice' && (
                <View className="space-y-4 pt-4 border-t border-gray-100">
                  <View>
                    <Text className="text-sm font-bold text-gray-500 uppercase mb-2 tracking-wider">{t('invoiceGeneration.selectClient')}</Text>
                    <View className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden">
                      {clients.length > 0 ? (
                        <View>
                           {clients.map(client => (
                             <TouchableOpacity
                               key={client.id}
                               onPress={() => setSelectedClientId(client.id)}
                               className={`p-4 border-b border-gray-50 ${selectedClientId === client.id ? 'bg-blue-50' : ''}`}
                             >
                               <Text className={`font-bold ${selectedClientId === client.id ? 'text-blue-600' : 'text-gray-700'}`}>{client.name}</Text>
                               {selectedClientId === client.id && (
                                 <View className="mt-1">
                                    <Text className="text-[10px] text-gray-500">
                                      {client.hourly_rate ? `• Hourly: £${client.hourly_rate} ` : ''}
                                      {client.daily_rate ? `• Day rate: £${client.daily_rate} ` : ''}
                                      {client.night_out_rate ? `• Night out: £${client.night_out_rate} ` : ''}
                                      {client.ppm_loaded_rate ? `• PPM loaded: ${client.ppm_loaded_rate}p ` : ''}
                                      {client.waiting_time_rate ? `• Waiting: £${client.waiting_time_rate}/hr after ${client.waiting_time_free_minutes || 60}m` : ''}
                                    </Text>
                                 </View>
                               )}
                             </TouchableOpacity>
                           ))}
                        </View>
                      ) : (
                        <Text className="p-4 text-gray-400 italic text-center">{t('businessProfile.clients.noClients')}</Text>
                      )}
                    </View>
                  </View>

                  <View>
                    <Text className="text-sm font-bold text-gray-500 uppercase mb-2 tracking-wider">{t('invoiceGeneration.manualInvoiceNumber')}</Text>
                    <TextInput
                      value={manualInvoiceNumber}
                      onChangeText={setManualInvoiceNumber}
                      keyboardType="numeric"
                      className="bg-white border-2 border-gray-100 rounded-xl p-4 font-bold text-gray-700"
                      placeholder="e.g. 0014"
                    />
                  </View>

                  <View>
                    <Text className="text-sm font-bold text-gray-500 uppercase mb-2 tracking-wider">{t('invoiceGeneration.description')}</Text>
                    <TextInput
                      value={invoiceDescription}
                      onChangeText={setInvoiceDescription}
                      className="bg-white border-2 border-gray-100 rounded-xl p-4 text-gray-700"
                      placeholder="e.g. HGV Driving Services"
                    />
                  </View>

                  <View className="flex-row justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <Text className="font-bold text-gray-700">{t('invoiceGeneration.includeExpenses')}</Text>
                    <Switch value={includeExpenses} onValueChange={setIncludeExpenses} trackColor={{ true: '#3b82f6' }} />
                  </View>

                  <View>
                    <Text className="text-sm font-bold text-gray-500 uppercase mb-2 tracking-wider">{t('invoiceGeneration.vatRate')}</Text>
                    <View className="flex-row gap-2">
                      {['0', '5', '20'].map(rate => (
                        <TouchableOpacity
                          key={rate}
                          onPress={() => setVatRate(rate)}
                          className={`flex-1 p-3 rounded-xl border-2 ${vatRate === rate ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-100'}`}
                        >
                          <Text className={`text-center font-bold ${vatRate === rate ? 'text-white' : 'text-gray-600'}`}>{rate}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View className="pt-2">
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-sm font-bold text-gray-500 uppercase tracking-wider">Manual Line Items</Text>
                        <TouchableOpacity onPress={addManualLineItem} className="bg-blue-100 px-3 py-1 rounded-full"><Text className="text-blue-600 text-xs font-bold">{t('invoiceGeneration.addManualLineItem')}</Text></TouchableOpacity>
                    </View>
                    {manualLineItems.map((item, index) => (
                        <View key={index} className="flex-row gap-2 mb-2">
                            <TextInput
                                value={item.description}
                                onChangeText={(val) => updateManualLineItem(index, 'description', val)}
                                placeholder="Description"
                                className="flex-1 bg-white border border-gray-200 rounded-lg p-2 text-xs"
                            />
                            <TextInput
                                value={item.amount}
                                onChangeText={(val) => updateManualLineItem(index, 'amount', val)}
                                placeholder="£"
                                keyboardType="numeric"
                                className="w-20 bg-white border border-gray-200 rounded-lg p-2 text-xs"
                            />
                            <TouchableOpacity onPress={() => removeManualLineItem(index)} className="p-2 bg-red-100 rounded-lg"><Trash size={14} color="red" /></TouchableOpacity>
                        </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
            <View className="h-10" />
          </ScrollView>

          <View className="p-6 border-t border-gray-100">
            <TouchableOpacity
              onPress={generateReport}
              disabled={isLoading}
              className="bg-blue-600 p-4 rounded-2xl shadow-sm flex-row justify-center items-center space-x-2"
            >
              {isLoading ? <ActivityIndicator color="white" /> : <ChevronDown size={20} color="white" />}
              <Text className="text-white font-bold text-lg">{isLoading ? t('common.saving') : t('generateReport')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showPicker && (
        <DateTimePicker
          value={showPicker === 'start' ? startDate : endDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowPicker(null);
            if (date) {
              if (showPicker === 'start') setStartDate(date);
              else setEndDate(date);
            }
          }}
        />
      )}
    </Modal>
  );
}
