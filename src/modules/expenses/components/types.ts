import type { Expense, ExpenseCategory, RecurringExpense, ExpenseFormData } from '@/types/Types_Expenses';

export type { Expense, ExpenseCategory, RecurringExpense, ExpenseFormData };

export interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  categories: ExpenseCategory[];
  editing: Expense | null;
  /** Valores prellenados (modo crear) — ej. al importar una factura XML. */
  prefill?: Partial<ExpenseFormData>;
}

export interface CategoryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  editing: ExpenseCategory | null;
}

export interface GeneralPickerModalProps {
  open: boolean;
  onClose: () => void;
  onAdopted: () => void;
  tenantId: string;
  alreadyAdopted: Set<string>;
}

export interface RecurringFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  categories: ExpenseCategory[];
  editing: RecurringExpense | null;
}

export interface RegisterRecurringModalProps {
  recurring: RecurringExpense;
  tenantId: string;
  onClose: () => void;
  onRegistered: () => void;
}

export interface RemindersBannerProps {
  due: RecurringExpense[];
  onRegister: (r: RecurringExpense) => void;
}

export interface CategoryCardProps {
  cat: ExpenseCategory;
  deletingId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  isGeneral: boolean;
}
