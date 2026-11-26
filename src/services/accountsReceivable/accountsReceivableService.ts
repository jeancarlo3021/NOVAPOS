import { apiFetch } from '@/lib/api';
import { readCaja } from '@/hooks/useCaja';

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
  /** Por qué se anuló (migración 151). */
  void_reason?: string | null;
  /** Caja que recibió el abono, si entró por una. */
  cash_session_id?: string | null;
  /** Esa caja ya está cerrada: anular este abono cambia un arqueo firmado. */
  caja_cerrada?: boolean;
  caja_fecha?: string | null;
}

/** Un abono ya cobrado, visto como ENTRADA DE DINERO (cierre y reportes). */
export interface AbonoCobrado {
  id: string;
  receivable_id: string;
  cliente: string | null;
  factura: string | null;
  origen: string | null;
  amount: number;
  method: string;
  note: string | null;
  user_id: string | null;
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
  /** Qué está viendo este usuario: si tiene zona asignada, no ve toda la cartera. */
  scope: () => apiFetch<{ zone: string | null; customers_total: number; customers_visible: number }>(
    '/accounts-receivable/scope'),

  list: (params?: { status?: string; customer_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.customer_id) q.set('customer_id', params.customer_id);
    const qs = q.toString();
    return apiFetch<Receivable[]>(`/accounts-receivable${qs ? '?' + qs : ''}`);
  },
  summary: () => apiFetch<ReceivableSummary>('/accounts-receivable/summary'),

  /**
   * CRÉDITOS SIN CUENTA POR COBRAR.
   *
   * Ventas a crédito cuya cuenta nunca se creó: la deuda no existe en ninguna
   * parte, así que nadie la ve y nadie la cobra. `huerfanas()` las encuentra y
   * `repararHuerfanas()` les crea la cuenta que les falta.
   */
  huerfanas: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return apiFetch<{
      cuantas: number; total: number; de_ruta: number;
      facturas: Array<{ id: string; invoice_number: string; customer_name: string | null; total: number; fecha: string; de_ruta: boolean }>;
    }>(`/accounts-receivable/huerfanas${qs ? '?' + qs : ''}`);
  },
  /**
   * `invoiceIds` repara SOLO esas ventas.
   *
   * Lo usa el cierre de caja: ahí se reparan los créditos de ESE turno. Con el
   * rango de fechas, el cajero de la tarde tocaría también los créditos de la
   * mañana, que son de otra persona.
   */
  repararHuerfanas: (from?: string, to?: string, invoiceIds?: string[]) =>
    apiFetch<{ revisadas: number; creadas: number; lista_creadas: string[]; fallaron: Array<{ invoice_number: string; motivo: string }> }>(
      '/accounts-receivable/huerfanas/reparar',
      { method: 'POST', body: JSON.stringify({ from, to, invoice_ids: invoiceIds }) }),

  /**
   * ¿ESTAS VENTAS A CRÉDITO QUEDARON COMO CUENTA POR COBRAR?
   *
   * El cierre de caja lo pregunta por las ventas a crédito de su turno: una
   * venta a crédito sin cuenta es una deuda que no existe en ninguna parte y
   * que nadie va a cobrar.
   */
  creditoEstado: (invoiceIds: string[]) =>
    apiFetch<{
      cuentas: Record<string, { id: string; total: number; pagado: number; saldo: number; status: string; due_date: string | null }>;
      sin_cuenta: string[];
    }>(`/accounts-receivable/credito-estado?invoice_ids=${encodeURIComponent(invoiceIds.join(','))}`),
  get: (id: string) => apiFetch<Receivable>(`/accounts-receivable/${id}`),
  create: (r: ReceivableInput) =>
    apiFetch<Receivable>('/accounts-receivable', { method: 'POST', body: JSON.stringify(r) }),
  update: (id: string, r: Partial<ReceivableInput>) =>
    apiFetch<Receivable>(`/accounts-receivable/${id}`, { method: 'PUT', body: JSON.stringify(r) }),
  // createdAt = momento real del abono (para abonos offline; si no se pasa, el
  // servidor usa "ahora"). Evita que un abono sincronizado tarde quede fuera de
  // la ventana del cierre del repartidor.
  /** `batchId` agrupa los abonos de un mismo pago masivo. */
  /**
   * `cashSessionId` liga el abono a la CAJA que recibió el dinero.
   *
   * Es lo que hace que el abono aparezca en el cierre de ese turno. Sin él, el
   * cajero cobraba una cuenta, metía la plata a la gaveta, y al cerrar el
   * sistema le marcaba ese monto como sobrante. Se manda solo cuando hay una
   * caja abierta: un abono de oficina o por depósito no es de nadie.
   */
  pay: (id: string, amount: number, method = 'cash', note?: string, createdAt?: string,
        batchId?: string, cashSessionId?: string | null) =>
    apiFetch<Receivable>(`/accounts-receivable/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({
        amount, method, note,
        created_at: createdAt ?? new Date().toISOString(),
        batch_id: batchId,
        cash_session_id: cashSessionId ?? null,
        /**
         * LA CAJA DE ESTA MÁQUINA.
         *
         * Va siempre que el equipo tenga una elegida, y el servidor la usa para
         * encontrar la gaveta abierta cuando la pantalla no tenía la sesión
         * cargada. Es lo que hace que el abono caiga en el cierre del POS
         * corriente aunque lo cobre un cajero que entró a relevar el turno y
         * que no fue el que abrió la caja.
         */
        terminal: (() => {
          try { return readCaja()?.terminal ?? null; } catch { return null; }
        })(),
      }),
    }),

  /** Abonos cobrados CON esta caja abierta (lo que suma el cierre). */
  paymentsOfSession: (sessionId: string) =>
    apiFetch<AbonoCobrado[]>(`/accounts-receivable/payments?session=${encodeURIComponent(sessionId)}`),

  /** Abonos cobrados en un rango de fechas (para los reportes). */
  paymentsByDate: (from: string, to: string) =>
    apiFetch<AbonoCobrado[]>(
      `/accounts-receivable/payments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
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
  /**
   * Anular un abono (solo admin/gerente/contador/propietario).
   *
   * El MOTIVO es obligatorio: anular mueve el saldo del cliente y, si el abono
   * entró por una caja, también la plata de ese arqueo. Sin motivo, al mes
   * siguiente nadie puede decir si fue un error de digitación o un cheque
   * devuelto —y para el cliente no es lo mismo—.
   *
   * `force` confirma el caso de la caja YA cerrada: el servidor responde 409
   * la primera vez para que la pantalla pueda avisar qué arqueo cambia.
   */
  voidPayment: (paymentId: string, reason: string, force = false) =>
    apiFetch<{ voided: boolean; amount: number; new_paid: number; caja_cerrada?: boolean; caja_fecha?: string | null }>(
      `/accounts-receivable/payments/${paymentId}/void`,
      { method: 'POST', body: JSON.stringify({ reason, force }) }),
};
