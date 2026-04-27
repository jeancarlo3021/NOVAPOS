export interface ExpenseCategoryGeneral {
  id: string;
  name: string;
  color: string;
  icon: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  icon: string;
  is_general: boolean;
  general_category_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'cash' | 'card' | 'sinpe' | 'transfer' | 'check';
export type ExpenseType = 'fixed' | 'variable' | 'occasional';

export interface Expense {
  id: string;
  tenant_id: string;
  category_id: string;
  category?: ExpenseCategory | null;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  payment_method: PaymentMethod;
  type: ExpenseType;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseFormData {
  description: string;
  amount: string;
  category_id: string;
  date: string;
  payment_method: PaymentMethod;
  type: ExpenseType;
  reference: string;
  notes: string;
}

export interface ExpenseFilters {
  from?: string;
  to?: string;
  category_id?: string;
  type?: ExpenseType | '';
  search?: string;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  avgPerDay: number;
  byCategory: Array<{ name: string; total: number; count: number; color: string; icon: string }>;
  byPaymentMethod: Array<{ method: string; label: string; total: number }>;
  byDay: Array<{ date: string; total: number }>;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  sinpe: 'SINPE',
  transfer: 'Transferencia',
  check: 'Cheque',
};

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  fixed: 'Gasto Fijo',
  variable: 'Gasto Variable',
  occasional: 'Ocasional',
};

export const DEFAULT_CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export const DEFAULT_CATEGORY_ICONS = [
  '🏢', '💡', '🚗', '📦', '👥', '🍽️', '🔧', '📱',
  '💰', '🎯', '📊', '🏥', '📚', '🛒', '🖥️', '🌐',
];
