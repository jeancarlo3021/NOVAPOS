import { apiFetch } from '@/lib/api';

export interface ReservationItem {
  id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ReservationPayment {
  id: string;
  amount: number;
  method: string;
  notes?: string | null;
  created_at: string;
  /** Caja en la que se recibió. Vacío = se busca por el horario del turno. */
  cash_session_id?: string | null;
}

export interface Reservation {
  id: string;
  number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: 'open' | 'delivered' | 'cancelled' | 'expired';
  total: number;
  paid: number;
  expires_on: string | null;
  notes: string | null;
  invoice_id: string | null;
  created_at: string;
  reservation_items?: ReservationItem[];
  payments?: ReservationPayment[];
}

export interface NewReservation {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  expires_on?: string | null;
  notes?: string | null;
  items: Array<{ product_id?: string | null; product_name: string; quantity: number; unit_price: number }>;
  deposit?: number;
  deposit_method?: string;
  cash_session_id?: string | null;
}

export const reservationsService = {
  list: (status: 'open' | 'delivered' | 'cancelled' | 'expired' | 'all' = 'open') =>
    apiFetch<Reservation[]>(`/reservations?status=${status}`),

  get: (id: string) => apiFetch<Reservation>(`/reservations/${id}`),

  /**
   * `inventario` dice si la mercadería quedó realmente apartada. Sin la columna
   * de apartados en la base, el apartado se guarda pero NO reserva nada, y eso
   * hay que poder avisarlo en pantalla.
   */
  create: (payload: NewReservation) =>
    apiFetch<Reservation & { inventario?: { ok: boolean; motivo?: string } }>(
      '/reservations', { method: 'POST', body: JSON.stringify(payload) }),

  /** Registra un abono. El servidor no deja pasarse del saldo. */
  addPayment: (id: string, amount: number, method = 'cash', cashSessionId?: string | null, notes?: string) =>
    apiFetch<Reservation>(`/reservations/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, method, cash_session_id: cashSessionId ?? null, notes: notes ?? null }),
    }),

  /**
   * Abonos de apartados, para el cierre de caja: es plata que entró al cajón
   * sin que haya factura todavía.
   */
  paymentsOfSession: (sessionId: string) =>
    apiFetch<Array<{
      id: string; reservation_id: string; numero: string | null; cliente: string | null;
      amount: number; method: string; notes: string | null; created_at: string;
    }>>(`/reservations/payments?session=${encodeURIComponent(sessionId)}`),

  /**
   * Corrige un abono ya registrado: medio de pago, nota o la caja a la que
   * pertenece. El monto no se cambia (para eso se borra y se vuelve a registrar).
   */
  updatePayment: (pagoId: string, patch: { method?: string; notes?: string | null; cash_session_id?: string | null }) =>
    apiFetch<ReservationPayment>(`/reservations/payments/${pagoId}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }),

  /** Borra un abono mal registrado y recalcula lo abonado del apartado. */
  deletePayment: (pagoId: string) =>
    apiFetch<{ deleted: true; paid: number }>(`/reservations/payments/${pagoId}`, { method: 'DELETE' }),

  /**
   * Entrega un apartado YA PAGADO: descuenta el inventario y lo cierra, SIN
   * crear una venta (la plata ya entró como abonos, día por día).
   */
  deliverPaid: (id: string) =>
    apiFetch<Reservation & { payments?: ReservationPayment[]; productos_descontados: number }>(
      `/reservations/${id}/deliver-paid`, { method: 'POST' }),

  /** Anula y devuelve la mercadería a la venta. Informa cuánto quedó abonado. */
  cancel: (id: string, reason?: string) =>
    apiFetch<Reservation & { refund_pending: number }>(
      `/reservations/${id}/cancel${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`,
      { method: 'POST' }),

  /** El apartado listo para cobrarlo en el punto de venta. */
  toCart: (id: string) =>
    apiFetch<{
      reservation_id: string; number: string | null; customer_id: string | null;
      customer_name: string | null; total: number; paid: number; balance: number;
      items: ReservationItem[];
    }>(`/reservations/${id}/to-cart`),

  /** Se llama después de facturar, para cerrar el apartado. */
  deliver: (id: string, invoiceId?: string | null) =>
    apiFetch<Reservation>(`/reservations/${id}/deliver`, {
      method: 'POST', body: JSON.stringify({ invoice_id: invoiceId ?? null }),
    }),
};

export default reservationsService;
