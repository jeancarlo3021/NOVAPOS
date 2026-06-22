import { apiFetch } from '@/lib/api';

export interface Receivable {
  id: string;
  tenant_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  total_amount: number;
  paid_amount: number;
  due_date?: string | null;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  source: 'pos' | 'manual' | 'distribution';
  notes?: string | null;
  created_at: string;
  updated_at: string;
  payments?: ReceivablePayment[];
}

export interface ReceivablePayment {
  id: string;
  receivable_id: string;
  amount: number;
  method: string;
  note?: string | null;
  created_at: string;
}

export interface ReceivableSummary {
  outstanding: number;
  overdue_count: number;
  overdue_amount: number;
  pending_count: number;
  by_customer: Array<{ customer_id: string | null; customer_name: string; balance: number; count: number }>;
}

export type ReceivableInput = {
  customer_id?: string | null;
  customer_name?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  total_amount: number;
  due_date?: string | null;
  source?: 'pos' | 'manual' | 'distribution';
  notes?: string | null;
};

export const accountsReceivableService = {
  list: (params?: { status?: string; customer_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.customer_id) q.set('customer_id', params.customer_id);
    const qs = q.toString();
    return apiFetch<Receivable[]>(`/accounts-receivable${qs ? '?' + qs : ''}`);
  },
  summary: () => apiFetch<ReceivableSummary>('/accounts-receivable/summary'),
  get: (id: string) => apiFetch<Receivable>(`/accounts-receivable/${id}`),
  create: (r: ReceivableInput) =>
    apiFetch<Receivable>('/accounts-receivable', { method: 'POST', body: JSON.stringify(r) }),
  update: (id: string, r: Partial<ReceivableInput>) =>
    apiFetch<Receivable>(`/accounts-receivable/${id}`, { method: 'PUT', body: JSON.stringify(r) }),
  pay: (id: string, amount: number, method = 'cash', note?: string) =>
    apiFetch<Receivable>(`/accounts-receivable/${id}/pay`, { method: 'POST', body: JSON.stringify({ amount, method, note }) }),
  remove: (id: string) =>
    apiFetch(`/accounts-receivable/${id}`, { method: 'DELETE' }),
};
