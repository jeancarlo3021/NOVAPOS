import { apiFetch } from '@/lib/api';

export type ReceiptType = 'subscription' | 'invoicing';

export interface PaymentReceipt {
  id: string;
  tenant_id: string;
  type: ReceiptType;
  amount: number;
  payment_date: string;          // YYYY-MM-DD
  period_start?: string | null;
  period_end?: string | null;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  file_url?: string | null;
  created_by?: string | null;
  created_at: string;
  tenant?: { id: string; name: string } | null;
}

export interface ReceiptFilters {
  tenant_id?: string;
  type?: ReceiptType;
  from?: string;
  to?: string;
}

export interface CreateReceiptPayload {
  tenant_id: string;
  type: ReceiptType;
  amount: number;
  payment_date?: string;
  period_start?: string | null;
  period_end?: string | null;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  file_url?: string | null;
}

export const paymentReceiptsService = {
  async list(filters: ReceiptFilters = {}): Promise<PaymentReceipt[]> {
    const qs = new URLSearchParams();
    if (filters.tenant_id) qs.set('tenant_id', filters.tenant_id);
    if (filters.type)      qs.set('type', filters.type);
    if (filters.from)      qs.set('from', filters.from);
    if (filters.to)        qs.set('to', filters.to);
    const url = `/admin/payment-receipts${qs.toString() ? '?' + qs.toString() : ''}`;
    return apiFetch<PaymentReceipt[]>(url);
  },

  async create(payload: CreateReceiptPayload): Promise<PaymentReceipt> {
    return apiFetch<PaymentReceipt>('/admin/payment-receipts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async remove(id: string): Promise<void> {
    await apiFetch(`/admin/payment-receipts/${id}`, { method: 'DELETE' });
  },
};
