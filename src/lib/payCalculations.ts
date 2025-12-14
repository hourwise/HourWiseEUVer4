// src/lib/payCalculations.ts

// --- 1. Interfaces ---
interface OvertimeTier {
    threshold: number;
multiplier?: number;
percentage?: number;
}

interface PayConfiguration {
hourlyRate: number;
shiftAllowance: number;
overtimeThresholdHours?: number;
overtimeRateMultiplier?: number;
overtimeRatePercentage?: number;
unpaidBreakMinutes: number;
additionalOvertimeTiers?: OvertimeTier[];
}

interface WorkSession {
startTime: string;
endTime: string;
totalWorkMinutes: number;
}

// --- 2. Helper: Safe Rate Calculation ---
const calculateTierRate = (baseRate: number, tier: OvertimeTier): number => {
if (tier.multiplier !== undefined) {
    return baseRate * tier.multiplier;
  }
  if (tier.percentage !== undefined) {
    return baseRate * (1 + tier.percentage / 100);
  }
  return baseRate;
};

// --- 3. Core Calculation Logic ---
function calculateDailyPayInternal(
  sessions: WorkSession[],
  payConfig: PayConfiguration
): number {
  if (!sessions || sessions.length === 0) {
    return 0;
  }

  const totalMinutesWorked = sessions.reduce(
    (sum, session) => sum + session.totalWorkMinutes,
    0
  );

  // Ensure we don't subtract more break time than worked time
  const paidMinutes = Math.max(0, totalMinutesWorked - payConfig.unpaidBreakMinutes);
  const hoursWorked = paidMinutes / 60;

  // --- DEBUGGING BLOCK: FORCE LOG ONCE ---
  // This log will show up in your Metro bundler terminal
  if (sessions.length > 0) {
     console.log(`[PAY CALC] Rate: £${payConfig.hourlyRate}/hr | Raw Mins: ${totalMinutesWorked} | Config Break Ded: ${payConfig.unpaidBreakMinutes}m | Final Paid Mins: ${paidMinutes}`);
  }
  // ---------------------------------------

  if (hoursWorked <= 0) {
    return 0;
  }

  let totalPay = 0;

  // Base Pay
  const threshold = payConfig.overtimeThresholdHours ?? Infinity;
  const baseHours = Math.min(hoursWorked, threshold);

  totalPay += baseHours * payConfig.hourlyRate;

  // Overtime Logic
  const totalOvertimeHours = Math.max(0, hoursWorked - baseHours);

  if (totalOvertimeHours > 0) {
    const tiers: OvertimeTier[] = [];

    const hasLegacyConfig = payConfig.overtimeRateMultiplier || payConfig.overtimeRatePercentage;
    if (hasLegacyConfig || !payConfig.additionalOvertimeTiers?.length) {
       tiers.push({
        threshold: 0,
        multiplier: payConfig.overtimeRateMultiplier,
        percentage: payConfig.overtimeRatePercentage,
      });
    }

    if (payConfig.additionalOvertimeTiers) {
      tiers.push(...payConfig.additionalOvertimeTiers);
    }

    tiers.sort((a, b) => a.threshold - b.threshold);

    for (let i = 0; i < tiers.length; i++) {
      const currentTier = tiers[i];
      const nextTier = tiers[i + 1];
      const tierStart = currentTier.threshold;
      const tierEnd = nextTier ? nextTier.threshold : Infinity;

      const hoursInThisTier = Math.max(0, Math.min(totalOvertimeHours, tierEnd) - tierStart);

      if (hoursInThisTier > 0) {
        const rate = calculateTierRate(payConfig.hourlyRate, currentTier);
        totalPay += hoursInThisTier * rate;
      }
    }
  }

  totalPay += payConfig.shiftAllowance;

  return Number(totalPay.toFixed(2));
}


// --- 4. EXPORTED ADAPTERS ---

export const formatCurrency = (amount: number | undefined | null, currencySymbol = '£') => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return `${currencySymbol}0.00`;
  }
  try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
      }).format(amount);
  } catch (e) {
      return `${currencySymbol}${amount.toFixed(2)}`;
  }
};

export const calculateDailyPay = (rawSessions: any[], rawConfig: any): number => {
    if (!rawConfig) {
        console.log("[PAY ERROR] No Pay Configuration found.");
        return 0;
    }
    if (!rawSessions || rawSessions.length === 0) {
        return 0;
    }

    const safeNum = (val: any) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    const payConfig: PayConfiguration = {
        hourlyRate: safeNum(rawConfig.hourly_rate),
        shiftAllowance: safeNum(rawConfig.shift_allowance),
        overtimeThresholdHours: rawConfig.overtime_threshold_hours ? safeNum(rawConfig.overtime_threshold_hours) : undefined,
        overtimeRateMultiplier: rawConfig.overtime_rate_multiplier ? safeNum(rawConfig.overtime_rate_multiplier) : undefined,
        overtimeRatePercentage: rawConfig.overtime_rate_percentage ? safeNum(rawConfig.overtime_rate_percentage) : undefined,
        unpaidBreakMinutes: safeNum(rawConfig.unpaid_break_minutes),
        additionalOvertimeTiers: rawConfig.additional_overtime_tiers || []
    };

    const sessions: WorkSession[] = rawSessions.map(s => ({
        startTime: s.start_time,
        endTime: s.end_time,
        totalWorkMinutes: safeNum(s.total_work_minutes)
    }));

    return calculateDailyPayInternal(sessions, payConfig);
};

export const calculateWeeklyPay = (dailyPays: Map<string, number>, weekStartDate: Date): number => {
  let weeklyTotal = 0;
  const currentCursor = new Date(weekStartDate);

  for (let i = 0; i < 7; i++) {
    const dateStr = currentCursor.toISOString().split('T')[0];
    const pay = dailyPays.get(dateStr);
    if (pay) {
      weeklyTotal += pay;
    }
    currentCursor.setDate(currentCursor.getDate() + 1);
  }

  return Number(weeklyTotal.toFixed(2));
};
