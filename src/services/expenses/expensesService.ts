import { apiFetch } from '@/lib/api';
import type {
  Expense, ExpenseCategory, ExpenseCategoryGeneral,
  ExpenseFormData, ExpenseFilters, ExpenseSummary,
  RecurringExpense, RecurringExpenseFormData,
} from '@/types/Types_Expenses';
import { PAYMENT_METHOD_LABELS } from '@/types/Types_Expenses';

// ── General categories (shared, read-only) ────────────────────────────────────

export const expenseCategoriesGeneralService = {
  async getAll(): Promise<ExpenseCategoryGeneral[]> {
    return apiFetch<ExpenseCategoryGeneral[]>('/expenses/categories/general');
  },
};

// ── Tenant categories ─────────────────────────────────────────────────────────

export const expenseCategoriesService = {
  async getAll(_tenantId: string): Promise<ExpenseCategory[]> {
    return apiFetch<ExpenseCategory[]>('/expenses/categories');
  },

  // Adopt a general category into this tenant's list
  async addFromGeneral(_tenantId: string, general: ExpenseCategoryGeneral): Promise<ExpenseCategory> {
    return apiFetch<ExpenseCategory>('/expenses/categories/from-general', {
      method: 'POST',
      body: JSON.stringify({ general_category_id: general.id }),
    });
  },

  // Create a fully custom category
  async create(
    _tenantId: string,
    payload: { name: string; color: string; icon: string },
  ): Promise<ExpenseCategory> {
    return apiFetch<ExpenseCategory>('/expenses/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(
    id: string,
    payload: Partial<{ name: string; color: string; icon: string }>,
  ): Promise<ExpenseCategory> {
    return apiFetch<ExpenseCategory>('/expenses/categories/' + id, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id: string): Promise<void> {
    await apiFetch('/expenses/categories/' + id, { method: 'DELETE' });
  },
};

// ── Expenses ──────────────────────────────────────────────────────────────────

export const expensesService = {
  async getAll(_tenantId: string, filters: ExpenseFilters = {}): Promise<Expense[]> {
    const params = new URLSearchParams();
    if (filters.from)        params.set('from', filters.from);
    if (filters.to)          params.set('to', filters.to);
    if (filters.category_id) params.set('category', filters.category_id);
    if (filters.type)        params.set('type', filters.type);
    if (filters.search)      params.set('search', filters.search);
    const qs = params.toString();
    return apiFetch<Expense[]>('/expenses' + (qs ? '?' + qs : ''));
  },

  async create(_tenantId: string, form: ExpenseFormData): Promise<Expense> {
    if (!form.category_id?.trim()) {
      throw new Error('Categoría de gasto es requerida');
    }
    return apiFetch<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify({
        description:    form.description,
        amount:         parseFloat(form.amount),
        category_id:    form.category_id,
        date:           form.date,
        payment_method: form.payment_method,
        type:           form.type,
        reference:      form.reference || null,
        notes:          form.notes || null,
      }),
    });
  },

  async update(id: string, form: Partial<ExpenseFormData>): Promise<Expense> {
    const patch: Record<string, unknown> = {};
    if (form.description    !== undefined) patch.description    = form.description;
    if (form.amount         !== undefined) patch.amount         = parseFloat(form.amount);
    if (form.category_id    !== undefined) patch.category_id    = form.category_id;
    if (form.date           !== undefined) patch.date           = form.date;
    if (form.payment_method !== undefined) patch.payment_method = form.payment_method;
    if (form.type           !== undefined) patch.type           = form.type;
    if (form.reference      !== undefined) patch.reference      = form.reference || null;
    if (form.notes          !== undefined) patch.notes          = form.notes || null;

    return apiFetch<Expense>('/expenses/' + id, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async delete(id: string): Promise<void> {
    await apiFetch('/expenses/' + id, { method: 'DELETE' });
  },

  async getSummary(_tenantId: string, from: string, to: string): Promise<ExpenseSummary> {
    const rows = await apiFetch<Expense[]>(`/expenses?from=${from}&to=${to}`);

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const count = rows.length;

    const msPerDay = 86400000;
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1);
    const avgPerDay = total / days;

    // By category
    const catMap = new Map<string, { name: string; total: number; count: number; color: string; icon: string }>();
    rows.forEach((r) => {
      const key = r.category?.name ?? 'Sin categoría';
      const existing = catMap.get(key);
      if (existing) {
        existing.total += r.amount;
        existing.count += 1;
      } else {
        catMap.set(key, {
          name: key,
          total: r.amount,
          count: 1,
          color: r.category?.color ?? '#6b7280',
          icon: r.category?.icon ?? '💰',
        });
      }
    });
    const byCategory = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

    // By payment method
    const pmMap = new Map<string, number>();
    rows.forEach((r) => {
      pmMap.set(r.payment_method, (pmMap.get(r.payment_method) ?? 0) + r.amount);
    });
    const byPaymentMethod = Array.from(pmMap.entries()).map(([method, t]) => ({
      method,
      label: PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method,
      total: t,
    }));

    // By day
    const dayMap = new Map<string, number>();
    rows.forEach((r) => {
      dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + r.amount);
    });
    const byDay = Array.from(dayMap.entries())
      .map(([date, t]) => ({ date, total: t }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { total, count, avgPerDay, byCategory, byPaymentMethod, byDay };
  },
};

// ── Recurring expenses ────────────────────────────────────────────────────────
/*
  SQL migration — run once in Supabase SQL editor:

  CREATE TABLE IF NOT EXISTS recurring_expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    category_id         UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    description         TEXT NOT NULL,
    default_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    frequency           TEXT NOT NULL DEFAULT 'monthly',
    day_of_month        SMALLINT,
    payment_method      TEXT NOT NULL DEFAULT 'cash',
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_generated_date DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS recurring_expense_id UUID
      REFERENCES recurring_expenses(id) ON DELETE SET NULL;
*/

// ── Due-date calculation helpers ──────────────────────────────────────────────

export function calcOverduePeriods(r: RecurringExpense): number {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (r.frequency === 'monthly') {
    const dom = r.day_of_month ?? 1;
    let y: number;
    let m: number;

    if (r.last_generated_date) {
      const last = new Date(r.last_generated_date + 'T12:00:00');
      // Start checking the month AFTER last generated
      m = last.getMonth() + 1;
      y = last.getFullYear();
      if (m > 11) { m = 0; y++; }
    } else {
      const created = new Date(r.created_at);
      y = created.getFullYear();
      m = created.getMonth();
    }

    let count = 0;
    for (let i = 0; i < 36; i++) {
      const due = new Date(y, m, dom);
      if (due > now) break;
      count++;
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return count;
  }

  if (r.frequency === 'annual') {
    if (!r.last_generated_date) return 1;
    const last = new Date(r.last_generated_date + 'T12:00:00');
    const next = new Date(last);
    next.setFullYear(next.getFullYear() + 1);
    return next <= now ? 1 : 0;
  }

  // weekly / biweekly
  const intervalDays = r.frequency === 'weekly' ? 7 : 14;
  if (!r.last_generated_date) return 1;
  const last     = new Date(r.last_generated_date + 'T12:00:00');
  const daysDiff = Math.floor((now.getTime() - last.getTime()) / 86400000);
  return Math.max(0, Math.floor(daysDiff / intervalDays));
}

// Returns the date string (YYYY-MM-DD) of the next/current due occurrence.
export function getNextDueDate(r: RecurringExpense): string {
  const today = new Date();

  if (r.frequency === 'monthly') {
    const dom = r.day_of_month ?? 1;
    if (r.last_generated_date) {
      const last = new Date(r.last_generated_date + 'T12:00:00');
      let m = last.getMonth() + 1;
      let y = last.getFullYear();
      if (m > 11) { m = 0; y++; }
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
    }
    // Never generated: use current month's dom
    const y = today.getFullYear();
    const m = today.getMonth();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
  }

  if (r.frequency === 'annual') {
    if (!r.last_generated_date) return today.toISOString().slice(0, 10);
    const last = new Date(r.last_generated_date + 'T12:00:00');
    const next = new Date(last);
    next.setFullYear(next.getFullYear() + 1);
    return next.toISOString().slice(0, 10);
  }

  const intervalDays = r.frequency === 'weekly' ? 7 : 14;
  if (!r.last_generated_date) return today.toISOString().slice(0, 10);
  const last = new Date(r.last_generated_date + 'T12:00:00');
  last.setDate(last.getDate() + intervalDays);
  return last.toISOString().slice(0, 10);
}

// ── CRUD service ──────────────────────────────────────────────────────────────

export const recurringExpensesService = {

  async getAll(_tenantId: string): Promise<RecurringExpense[]> {
    return apiFetch<RecurringExpense[]>('/expenses/recurring');
  },

  async create(_tenantId: string, form: RecurringExpenseFormData): Promise<RecurringExpense> {
    if (!form.category_id?.trim()) {
      throw new Error('Categoría de gasto es requerida');
    }
    return apiFetch<RecurringExpense>('/expenses/recurring', {
      method: 'POST',
      body: JSON.stringify({
        description:    form.description,
        default_amount: parseFloat(form.default_amount),
        category_id:    form.category_id,
        frequency:      form.frequency,
        day_of_month:   form.frequency === 'monthly' ? (parseInt(form.day_of_month) || 1) : null,
        payment_method: form.payment_method,
        notes:          form.notes || null,
        is_active:      true,
      }),
    });
  },

  async update(id: string, form: Partial<RecurringExpenseFormData>): Promise<RecurringExpense> {
    const patch: Record<string, unknown> = {};
    if (form.description    !== undefined) patch.description    = form.description;
    if (form.default_amount !== undefined) patch.default_amount = parseFloat(form.default_amount);
    if (form.category_id    !== undefined) {
      if (!form.category_id?.trim()) {
        throw new Error('Categoría de gasto es requerida');
      }
      patch.category_id = form.category_id;
    }
    if (form.frequency      !== undefined) {
      patch.frequency    = form.frequency;
      patch.day_of_month = form.frequency === 'monthly' ? (parseInt(form.day_of_month ?? '1') || 1) : null;
    }
    if (form.payment_method !== undefined) patch.payment_method = form.payment_method;
    if (form.notes          !== undefined) patch.notes          = form.notes || null;

    return apiFetch<RecurringExpense>('/expenses/recurring/' + id, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async toggleActive(id: string, is_active: boolean): Promise<void> {
    await apiFetch('/expenses/recurring/' + id + '/toggle', {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    });
  },

  async delete(id: string): Promise<void> {
    await apiFetch('/expenses/recurring/' + id, { method: 'DELETE' });
  },

  // Register a payment for a recurring expense. Creates an expense record and
  // advances last_generated_date on the recurring template.
  async register(
    _tenantId: string,
    recurring: RecurringExpense,
    amount: number,
    date: string,
    notes?: string,
  ): Promise<Expense> {
    return apiFetch<Expense>('/expenses/recurring/' + recurring.id + '/register', {
      method: 'POST',
      body: JSON.stringify({ amount, date, notes }),
    });
  },
};
