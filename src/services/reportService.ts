import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';
import { calculateDailyPay } from '../lib/payCalculations';

// Helper to convert seconds to HH:MM format
const formatHHMM = (seconds: number) => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// Main report generation function
export const generateReport = async (startDate: Date, endDate: Date, type: 'work' | 'invoice') => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated.');

  // 1. Fetch Business Profile, Pay Config, Work Sessions, and Expenses
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, business_profiles(*), pay_configurations(*)')
    .eq('user_id', user.id)
    .single();

  const businessProfile = profile?.business_profiles?.[0];
  const payConfig = profile?.pay_configurations?.[0];

  const { data: sessions, error: sessionsError } = await supabase
    .from('work_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (sessionsError || expensesError) throw sessionsError || expensesError;
  if (!sessions || sessions.length === 0) throw new Error('No data found for this period.');

  // 3. Aggregate Data & Calculate Pay
  let totalWorkSeconds = 0, totalBreakSeconds = 0, totalDrivingSeconds = 0, totalEarnings = 0, totalExpenses = 0;
  
  const sessionsByDate = sessions.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {} as Record<string, typeof sessions>);

  const tableRows = Object.entries(sessionsByDate).map(([date, daySessions]) => {
    const dailyWorkSecs = daySessions.reduce((sum, s) => sum + (s.total_work_minutes || 0) * 60, 0);
    const dailyBreakSecs = daySessions.reduce((sum, s) => sum + (s.total_break_minutes || 0) * 60, 0);
    const dailyDrivingSecs = daySessions.reduce((sum, s) => sum + (s.other_data?.driving || 0) * 60, 0);
    
    totalWorkSeconds += dailyWorkSecs;
    totalBreakSeconds += dailyBreakSecs;
    totalDrivingSeconds += dailyDrivingSecs;

    let earningsColumn = '';
    if (type === 'invoice' && payConfig) {
      const dailyPay = calculateDailyPay(daySessions, payConfig);
      totalEarnings += dailyPay;
      earningsColumn = `<td>£${dailyPay.toFixed(2)}</td>`;
    }

    return `<tr><td>${new Date(date).toLocaleDateString()}</td><td>${formatHHMM(dailyWorkSecs)}</td><td>${formatHHMM(dailyDrivingSecs)}</td><td>${formatHHMM(dailyBreakSecs)}</td>${earningsColumn}</tr>`;
  }).join('');

  const expenseRows = (expenses || []).map(exp => {
    totalExpenses += Number(exp.amount);
    return `<tr><td>${new Date(exp.date).toLocaleDateString()}</td><td>${exp.category}</td><td>£${Number(exp.amount).toFixed(2)}</td></tr>`;
  }).join('');

  // 4. Construct HTML for the PDF
  const logoImage = businessProfile?.logo_url ? `<img src="${businessProfile.logo_url}" style="width: 120px; height: auto; position: absolute; top: 20px; right: 20px;" />` : '';
  const earningsHeader = type === 'invoice' ? '<th>Earnings</th>' : '';
  const totalEarningsRow = type === 'invoice' ? `<p><strong>Total Earnings:</strong> £${totalEarnings.toFixed(2)}</p>` : '';
  const grandTotalRow = type === 'invoice' ? `<p><strong>Grand Total (Earnings + Expenses):</strong> £${(totalEarnings + totalExpenses).toFixed(2)}</p>` : '';
  const bankDetails = type === 'invoice' && businessProfile ? `<div class="section"><h3>Bank Details</h3><p><strong>Account Name:</strong> ${businessProfile.bank_account_name || ''}</p><p><strong>Sort Code:</strong> ${businessProfile.bank_sort_code || ''}</p><p><strong>Account Number:</strong> ${businessProfile.bank_account_number || ''}</p><p><strong>IBAN:</strong> ${businessProfile.iban || ''}</p></div>` : '';
  const expenseSection = expenseRows ? `<div class="section"><h2>Expense Summary</h2><table><thead><tr><th>Date</th><th>Category</th><th>Amount</th></tr></thead><tbody>${expenseRows}</tbody></table><p style="text-align: right; font-weight: bold; margin-top: 10px;">Total Expenses: £${totalExpenses.toFixed(2)}</p></div>` : '';

  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; margin: 40px; color: #333; }
          h1, h2, h3 { color: #1e3a8a; }
          .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 30px; position: relative; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .section { margin-top: 30px; padding: 20px; background-color: #eef2ff; border-left: 5px solid #1e3a8a; }
        </style>
      </head>
      <body>
        <div class="header"><h1>${type === 'invoice' ? 'Invoice' : 'Work Report'}</h1><p>${businessProfile?.legal_name || user.email}</p><p>Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</p>${logoImage}</div>
        <div class="section"><h2>Work Summary</h2><table><thead><tr><th>Date</th><th>Work Time</th><th>Driving Time</th><th>Break Time</th>${earningsHeader}</tr></thead><tbody>${tableRows}</tbody></table></div>
        <div class="section" style="padding: 10px 20px;">
            <p><strong>Total Work Time:</strong> ${formatHHMM(totalWorkSeconds)}</p>
            <p><strong>Total Driving Time:</strong> ${formatHHMM(totalDrivingSeconds)}</p>
            <p><strong>Total Break Time:</strong> ${formatHHMM(totalBreakSeconds)}</p>
            ${totalEarningsRow}
        </div>
        ${expenseSection}
        <div class="section" style="padding: 10px 20px;">
            ${grandTotalRow}
        </div>
        ${bankDetails}
      </body>
    </html>`;

  // 5. Generate and Share PDF
  const { uri } = await Print.printToFileAsync({ html: htmlContent });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your report' });
};
