import { supabase } from '../lib/supabase';

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export type EndShiftVehicleCheck = {
  id: string;
  reg_number: string;
  odometer_reading: number | null;
  closing_odometer: number | null;
  created_at: string | null;
};

export type FuelExpenseOption = {
  id: string;
  amount: number;
  currency: string | null;
  merchant: string | null;
  date: string;
  fuel_litres: number | null;
  session_id: string | null;
  vehicle_check_id: string | null;
  vehicle_reg: string | null;
};

export type EndShiftChecklistData = {
  vehicleCheck: EndShiftVehicleCheck | null;
  fuelExpenses: FuelExpenseOption[];
};

export type SaveEndShiftChecklistInput = {
  sessionId: string | null;
  vehicleCheckId?: string | null;
  vehicleReg?: string | null;
  openingOdometer?: number | null;
  closingOdometer?: number | null;
  selectedFuelExpenseId?: string | null;
  fuelLitres?: number | null;
};

export async function fetchEndShiftChecklistData(
  userId: string,
  sessionId: string | null
): Promise<EndShiftChecklistData> {
  let vehicleCheck: EndShiftVehicleCheck | null = null;
  let fuelExpenses: FuelExpenseOption[] = [];

  if (sessionId) {
    const { data, error } = await supabase
      .from('vehicle_checks')
      .select('id, reg_number, odometer_reading, closing_odometer, created_at')
      .eq('driver_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('End-shift vehicle check lookup failed:', error.message);
    } else {
      vehicleCheck = data ?? null;
    }
  }

  const today = toLocalDateString(new Date());
  const { data: expenses, error: expenseError } = await supabase
    .from('expenses')
    .select('id, amount, currency, merchant, date, fuel_litres, session_id, vehicle_check_id, vehicle_reg')
    .eq('user_id', userId)
    .eq('category', 'Fuel')
    .gte('date', today)
    .order('created_at', { ascending: false })
    .limit(20);

  if (expenseError) {
    console.warn('End-shift fuel expense lookup failed:', expenseError.message);
  } else {
    fuelExpenses = expenses ?? [];
  }

  return { vehicleCheck, fuelExpenses };
}

export async function saveEndShiftChecklist(input: SaveEndShiftChecklistInput) {
  const closing =
    typeof input.closingOdometer === 'number' && Number.isFinite(input.closingOdometer)
      ? input.closingOdometer
      : null;

  if (
    typeof closing === 'number' &&
    typeof input.openingOdometer === 'number' &&
    Number.isFinite(input.openingOdometer) &&
    closing < input.openingOdometer
  ) {
    throw new Error('Closing odometer cannot be lower than opening odometer.');
  }

  const fuelLitres =
    typeof input.fuelLitres === 'number' && Number.isFinite(input.fuelLitres)
      ? input.fuelLitres
      : null;

  if (typeof fuelLitres === 'number' && fuelLitres < 0) {
    throw new Error('Fuel litres cannot be negative.');
  }

  if (input.vehicleCheckId && closing !== null) {
    const { error } = await supabase
      .from('vehicle_checks')
      .update({ closing_odometer: closing })
      .eq('id', input.vehicleCheckId);

    if (error) throw new Error(error.message);
  }

  if (input.selectedFuelExpenseId) {
    const { error } = await supabase
      .from('expenses')
      .update({
        fuel_litres: fuelLitres,
        session_id: input.sessionId,
        vehicle_check_id: input.vehicleCheckId ?? null,
        vehicle_reg: input.vehicleReg ?? null,
      })
      .eq('id', input.selectedFuelExpenseId);

    if (error) throw new Error(error.message);
  }
}
