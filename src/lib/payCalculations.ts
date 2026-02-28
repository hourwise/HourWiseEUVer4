// src/lib/payCalculations.ts

// --- 1. Interfaces ---
interface Tier {
    threshold: number;
    rate?: number; // Can be a direct rate or multiplier
    multiplier?: number;
    unit: 'day' | 'week' | 'month' | 'hour' | 'shift';
}

interface Allowance {
    amount: number;
    unit: 'hour' | 'day' | 'week' | 'month' | 'shift';
}

interface PayConfiguration {
    hourlyRate: number;
    unpaidBreakMinutes: number;
    overtimeThreshold?: number;
    overtimeThresholdUnit?: 'day' | 'week' | 'month';
    overtimeRateMultiplier?: number;
    additionalOvertimeTiers?: Tier[];
    allowanceTiers?: Allowance[];
}

interface WorkSession {
    date: string; // YYYY-MM-DD
    totalWorkMinutes: number;
}

interface DailyPayDetails {
    date: string;
    basePay: number;
    overtimePay: number;
    allowancePay: number;
    totalPay: number;
    paidMinutes: number;
}

// --- 2. Core Calculation Logic ---

/**
 * Calculates pay for a set of sessions based on the provided configuration.
 * This is the main exported function.
 */
export const calculatePay = (
    sessions: WorkSession[],
    config: PayConfiguration
): Map<string, DailyPayDetails> => {
    const dailyMinutes = new Map<string, number>();
    for (const session of sessions) {
        const currentMins = dailyMinutes.get(session.date) || 0;
        dailyMinutes.set(session.date, currentMins + session.totalWorkMinutes);
    }

    const weeklyTotalMinutes = Array.from(dailyMinutes.values()).reduce((a, b) => a + b, 0);
    let weeklyOvertimeMinutes = 0;

    if (config.overtimeThresholdUnit === 'week' && config.overtimeThreshold) {
        const weeklyThresholdMinutes = config.overtimeThreshold * 60;
        if (weeklyTotalMinutes > weeklyThresholdMinutes) {
            weeklyOvertimeMinutes = weeklyTotalMinutes - weeklyThresholdMinutes;
        }
    }

    const results = new Map<string, DailyPayDetails>();

    for (const [date, totalMinutes] of dailyMinutes.entries()) {
        const paidMinutes = Math.max(0, totalMinutes - config.unpaidBreakMinutes);
        let hoursWorked = paidMinutes / 60;

        let basePay = 0;
        let overtimePay = 0;

        // Daily Overtime Calculation
        if (config.overtimeThresholdUnit === 'day' && config.overtimeThreshold && hoursWorked > config.overtimeThreshold) {
            const baseHours = config.overtimeThreshold;
            const overtimeHours = hoursWorked - baseHours;
            basePay = baseHours * config.hourlyRate;
            overtimePay = overtimeHours * config.hourlyRate * (config.overtimeRateMultiplier || 1);
        } else {
            basePay = hoursWorked * config.hourlyRate;
        }

        // Weekly Overtime Distribution (simplified)
        // This distributes weekly overtime pay proportionally across the days worked
        if (weeklyOvertimeMinutes > 0) {
            const dailyProportion = totalMinutes / weeklyTotalMinutes;
            const otMinutesForDay = weeklyOvertimeMinutes * dailyProportion;
            overtimePay += (otMinutesForDay / 60) * config.hourlyRate * (config.overtimeRateMultiplier || 1);
            // To prevent double counting, we'd need a more elaborate system,
            // but for now, we remove the base pay attributed to these minutes.
            basePay -= (otMinutesForDay / 60) * config.hourlyRate;
        }

        // Allowance Calculation
        const allowancePay = (config.allowanceTiers || []).reduce((total, allowance) => {
            if (allowance.unit === 'shift' || allowance.unit === 'day') {
                return total + allowance.amount;
            }
            if (allowance.unit === 'hour') {
                return total + (allowance.amount * hoursWorked);
            }
            return total;
        }, 0);

        const totalPay = basePay + overtimePay + allowancePay;

        results.set(date, {
            date,
            basePay,
            overtimePay,
            allowancePay,
            totalPay,
            paidMinutes,
        });
    }

    return results;
};


// --- 3. EXPORTED ADAPTERS ---

export const formatCurrency = (amount: number | undefined | null, currencySymbol = '£') => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return `${currencySymbol}0.00`;
  }
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
};

// This adapter prepares raw Supabase data for the calculation engine.
export const calculatePayFromRaw = (rawSessions: any[], rawConfig: any): Map<string, DailyPayDetails> => {
    if (!rawConfig) {
        console.warn("[PAY CALC] No Pay Configuration found.");
        return new Map();
    }

    const safeNum = (val: any, defaultVal = 0) => (val === null || val === undefined || isNaN(Number(val))) ? defaultVal : Number(val);

    const payConfig: PayConfiguration = {
        hourlyRate: safeNum(rawConfig.hourly_rate),
        unpaidBreakMinutes: safeNum(rawConfig.unpaid_break_minutes),
        overtimeThreshold: rawConfig.overtime_threshold_hours ? safeNum(rawConfig.overtime_threshold_hours) : undefined,
        overtimeThresholdUnit: rawConfig.overtime_threshold_unit,
        overtimeRateMultiplier: rawConfig.overtime_rate_multiplier ? safeNum(rawConfig.overtime_rate_multiplier) : undefined,
        additionalOvertimeTiers: rawConfig.additional_overtime_tiers || [],
        allowanceTiers: rawConfig.allowance_tiers || [],
    };

    const sessions: WorkSession[] = rawSessions.map(s => ({
        date: s.date, // Assuming session has a 'date' field in 'YYYY-MM-DD' format
        totalWorkMinutes: safeNum(s.total_work_minutes),
    }));

    return calculatePay(sessions, payConfig);
};
