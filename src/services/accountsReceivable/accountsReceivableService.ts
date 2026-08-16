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
  /** Momento en que la cuenta quedó CANCELADA (saldo en cero). */
  paid_at?: string | null;
  /**
   * La factura de origen llegó a HACIENDA (tiene clave).
   *
   * No es lo mismo que tener `invoice_id`: una venta con tiquete CORRIENTE crea
   * su factura interna pero nunca se declaró, así que al cobrarla sí corresponde
   * emitir el comprobante.
   */
  invoice_electronic?: boolean;
  invoice_document_type?: string | null;
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
  /** Agrupa los abonos que entraron con un mismo pago masivo. */
  batch_id?: string | null;
  created_at: string;
  voided_at?: string | null;
  voided_by?: string | null;
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
  // createdAt = momento real del abono (para abonos offline; si no se pasa, el
  // servidor usa "ahora"). Evita que un abono sincronizado tarde quede fuera de
  // la ventana del cierre del repartidor.
  /** `batchId` agrupa los abonos de un mismo pago masivo. */
  pay: (id: string, amount: number, method = 'cash', note?: string, createdAt?: string, batchId?: string) =>
    apiFetch<Receivable>(`/accounts-receivable/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({
        amount, method, note,
        created_at: createdAt ?? new Date().toISOString(),
        batch_id: batchId,
      }),
    }),
  /**
   * Emite el comprobante de un abono.
   *
   * Solo por el monto de las cuentas SIN factura previa: una venta a crédito ya
   * emitió su comprobante al venderse, y otro al cobrar declararía el mismo
   * ingreso dos veces.
   */
  emitReceipt: (body: {
    amount: number;
    document_type: 'ticket' | 'tiquete_electronico' | 'factura_electronica';
    customer_id?: string | null;
    customer_name?: string | null;
    batch_id?: string;
    payment_method?: string;
    /** Cuentas cubiertas, para que el servidor revalide cuáles no se declararon. */
    account_ids?: string[];
  }) => apiFetch<{ invoice_number?: string; clave?: string; emitted?: boolean; error?: string }>(
    '/accounts-receivable/emit-receipt', { method: 'POST', body: JSON.stringify(body) }),

  remove: (id: string) =>
    apiFetch(`/accounts-receivable/${id}`, { method: 'DELETE' }),
  /** Anular un abono (solo admin/gerente/contador/propietario). */
  voidPayment: (paymentId: string) =>
    apiFetch<{ voided: boolean; amount: number }>(`/accounts-receivable/payments/${paymentId}/void`, { method: 'POST' }),
};
