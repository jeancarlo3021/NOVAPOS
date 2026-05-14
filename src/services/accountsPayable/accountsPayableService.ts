/**
 * Accounts Payable Service
 *
 * Required SQL migration (run once in Supabase SQL editor):
 *
 * CREATE TABLE public.accounts_payable (
 *   id uuid NOT NULL DEFAULT gen_random_uuid(),
 *   tenant_id uuid NOT NULL,
 *   purchase_id uuid NOT NULL,
 *   supplier_id uuid NOT NULL,
 *   purchase_number text NOT NULL,
 *   supplier_name text NOT NULL,
 *   total_amount numeric NOT NULL,
 *   paid_amount numeric NOT NULL DEFAULT 0,
 *   due_date date NOT NULL,
 *   status text NOT NULL DEFAULT 'pending'
 *     CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
 *   payment_terms text,
 *   notes text,
 *   created_at timestamp without time zone DEFAULT now(),
 *   updated_at timestamp without time zone DEFAULT now(),
 *   CONSTRAINT accounts_payable_pkey PRIMARY KEY (id),
 *   CONSTRAINT accounts_payable_tenant_id_fkey
 *     FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
 *   CONSTRAINT accounts_payable_purchase_id_fkey
 *     FOREIGN KEY (purchase_id) REFERENCES public.purchases(id),
 *   CONSTRAINT accounts_payable_supplier_id_fkey
 *     FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
 * );
 */

import { apiFetch } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type APStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export interface AccountPayable {
  id: string;
  tenant_id: string;
  purchase_id: string;
  supplier_id: string;
  purchase_number: string;
  supplier_name: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;         // YYYY-MM-DD
  status: APStatus;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface APPaymentPayload {
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'card' | 'sinpe' | 'transfer' | 'check';
  notes?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses supplier payment_terms into number of days.
 * Returns null for "Contado" (immediate) or unrecognized terms.
 */
export function termsToDays(terms: string | null | undefined): number | null {
  if (!terms || terms.trim().toLowerCase() === 'contado') return null;
  const match = terms.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Calculates due date from a base date and payment terms string.
 */
export function calcDueDate(baseDate: string, terms: string): string {
  const days = termsToDays(terms);
  if (!days) return baseDate;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Service ───────────────────────────────────────────────────────────────────

export const accountsPayableService = {

  async getAll(_tenantId: string): Promise<AccountPayable[]> {
    return apiFetch<AccountPayable[]>('/accounts-payable');
  },

  async create(payload: Omit<AccountPayable, 'id' | 'created_at' | 'updated_at'>): Promise<AccountPayable> {
    return apiFetch<AccountPayable>('/accounts-payable', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Check if an AP entry already exists for this purchase
  async existsForPurchase(purchaseId: string): Promise<boolean> {
    const items = await apiFetch<AccountPayable[]>(`/accounts-payable?purchase_id=${purchaseId}`);
    return items.length > 0;
  },

  async registerPayment(id: string, p: APPaymentPayload): Promise<AccountPayable> {
    return apiFetch<AccountPayable>(`/accounts-payable/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(p),
    });
  },

  async delete(id: string): Promise<void> {
    await apiFetch(`/accounts-payable/${id}`, { method: 'DELETE' });
  },

  getSummary(items: AccountPayable[]) {
    const today = new Date().toISOString().slice(0, 10);
    const pending  = items.filter(i => i.status !== 'paid');
    const overdue  = items.filter(i => i.status === 'overdue' || (i.status !== 'paid' && i.due_date < today));
    const upcoming = pending.filter(i => i.due_date >= today && i.due_date <= addDays(today, 7));
    return {
      totalPending:  pending.reduce((s, i)  => s + (i.total_amount - i.paid_amount), 0),
      totalOverdue:  overdue.reduce((s, i)  => s + (i.total_amount - i.paid_amount), 0),
      totalUpcoming: upcoming.reduce((s, i) => s + (i.total_amount - i.paid_amount), 0),
      totalPaid:     items.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0),
      countPending:  pending.length,
      countOverdue:  overdue.length,
    };
  },
};

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
