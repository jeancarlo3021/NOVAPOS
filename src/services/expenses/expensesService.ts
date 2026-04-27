import { supabase } from '@/lib/supabase';
import type {
  Expense, ExpenseCategory, ExpenseCategoryGeneral,
  ExpenseFormData, ExpenseFilters, ExpenseSummary,
} from '@/types/Types_Expenses';
import { PAYMENT_METHOD_LABELS } from '@/types/Types_Expenses';

// ── General categories (shared, read-only) ────────────────────────────────────

export const expenseCategoriesGeneralService = {
  async getAll(): Promise<ExpenseCategoryGeneral[]> {
    const { data, error } = await supabase
      .from('expense_categories_general')
      .select('*')
      .order('name');
    if (error) throw error;
    return data ?? [];
  },
};

// ── Tenant categories ─────────────────────────────────────────────────────────

export const expenseCategoriesService = {
  async getAll(tenantId: string): Promise<ExpenseCategory[]> {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as ExpenseCategory[];
  },

  // Adopt a general category into this tenant's list
  async addFromGeneral(tenantId: string, general: ExpenseCategoryGeneral): Promise<ExpenseCategory> {
    const { data, error } = await supabase
      .from('expense_categories')
      .insert([{
        tenant_id: tenantId,
        name: general.name,
        color: general.color,
        icon: general.icon,
        is_general: true,
        general_category_id: general.id,
      }])
      .select()
      .single();
    if (error) throw error;
    return data as ExpenseCategory;
  },

  // Create a fully custom category
  async create(
    tenantId: string,
    payload: { name: string; color: string; icon: string },
  ): Promise<ExpenseCategory> {
    const { data, error } = await supabase
      .from('expense_categories')
      .insert([{ tenant_id: tenantId, is_general: false, ...payload }])
      .select()
      .single();
    if (error) throw error;
    return data as ExpenseCategory;
  },

  async update(
    id: string,
    payload: Partial<{ name: string; color: string; icon: string }>,
  ): Promise<ExpenseCategory> {
    const { data, error } = await supabase
      .from('expense_categories')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ExpenseCategory;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('expense_categories').delete().eq('id', id);
    if (error) throw error;
  },
};

// ── Expenses ──────────────────────────────────────────────────────────────────

export const expensesService = {
  async getAll(tenantId: string, filters: ExpenseFilters = {}): Promise<Expense[]> {
    let q = supabase
      .from('expenses')
      .select('*, category:expense_categories(*)')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.from)        q = q.gte('date', filters.from);
    if (filters.to)          q = q.lte('date', filters.to);
    if (filters.category_id) q = q.eq('category_id', filters.category_id);
    if (filters.type)        q = q.eq('type', filters.type);
    if (filters.search)      q = q.ilike('description', `%${filters.search}%`);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Expense[];
  },

  async create(tenantId: string, form: ExpenseFormData): Promise<Expense> {
    const { data, error } = await supabase
      .from('expenses')
      .insert([{
        tenant_id: tenantId,
        description: form.description,
        amount: parseFloat(form.amount),
        category_id: form.category_id,
        date: form.date,
        payment_method: form.payment_method,
        type: form.type,
        reference: form.reference || null,
        notes: form.notes || null,
      }])
      .select('*, category:expense_categories(*)')
      .single();
    if (error) throw error;
    return data as Expense;
  },

  async update(id: string, form: Partial<ExpenseFormData>): Promise<Expense> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (form.description    !== undefined) patch.description    = form.description;
    if (form.amount         !== undefined) patch.amount         = parseFloat(form.amount);
    if (form.category_id    !== undefined) patch.category_id    = form.category_id;
    if (form.date           !== undefined) patch.date           = form.date;
    if (form.payment_method !== undefined) patch.payment_method = form.payment_method;
    if (form.type           !== undefined) patch.type           = form.type;
    if (form.reference      !== undefined) patch.reference      = form.reference || null;
    if (form.notes          !== undefined) patch.notes          = form.notes || null;

    const { data, error } = await supabase
      .from('expenses')
      .update(patch)
      .eq('id', id)
      .select('*, category:expense_categories(*)')
      .single();
    if (error) throw error;
    return data as Expense;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
  },

  async getSummary(tenantId: string, from: string, to: string): Promise<ExpenseSummary> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, category:expense_categories(*)')
      .eq('tenant_id', tenantId)
      .gte('date', from)
      .lte('date', to)
      .order('date');

    if (error) throw error;
    const rows = (data ?? []) as Expense[];

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
