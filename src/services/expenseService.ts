import { supabase } from '../lib/supabase';

export interface Expense {
  user_id: string;
  amount: number;
  currency: string;
  merchant?: string;
  date?: string;
  category?: string;
  notes?: string;
  receipt_url?: string;
  raw_ocr_text?: string;
}

const addExpense = async (expense: Omit<Expense, 'user_id'>, userId: string) => {
  const { data, error } = await supabase
    .from('expenses')
    .insert([{ ...expense, user_id: userId }])
    .select();

  if (error) {
    console.error('Error adding expense:', error);
    throw new Error(error.message);
  }

  return data;
};

export const expenseService = {
  addExpense,
};
