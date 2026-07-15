import { apiFetch } from '@/lib/api';

export interface ReceivedItem {
  detail: string; quantity: number; unit?: string | null;
  cabys?: string | null; unit_price: number; total: number;
}
export interface ReceivedDoc {
  id: string;
  clave: string | null;
  issuer_name: string | null;
  issuer_id: string | null;
  document_type: string | null;
  date: string | null;
  total: number;
  tax?: number;
  ack_status: string | null;
  kind?: 'gasto' | 'compra' | null;
  items?: ReceivedItem[] | null;
  /** Origen del comprobante: 'email' (cron por correo), 'manual', 'alanube'. */
  source?: string | null;
  /** Remitente del correo del que llegó (cuando source='email'). */
  email_from?: string | null;
  /** Borrador de compra ya creado automáticamente (cuando llega por correo). */
  purchase_id?: string | null;
  raw?: any;
}

export const haciendaService = {
  /** Verifica la conexión con Facturemos (token + emisor). */
  testConnection: () => apiFetch<{ token_ok: boolean; emisor_configured: boolean; message?: string }>(
    '/hacienda/test-connection', { method: 'POST' }),

  /** Emite un documento electrónico a Hacienda (vía Facturemos) por su factura. */
  emit: (invoiceId: string) => apiFetch<{ clave?: string; consecutivo?: string; response?: any }>(
    '/hacienda/emit', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId }) }),

  /** Devuelve el payload EXACTO que se enviaría a Facturemos, SIN enviarlo (diagnóstico). */
  debug: (invoiceId: string) => apiFetch<{ environment: string; apiKeyEmisor_last4: string; emisor_cedula: string; ConsecutivoModel: any; Factura: any }>(
    '/hacienda/emit', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, debug: true }) }),

  /** Consulta el estatus de un documento ya emitido por su clave. */
  status: (clave: string) => apiFetch<any>(`/hacienda/status/${clave}`),

  /** Consulta el estatus por factura y lo GUARDA (aceptado/rechazado). */
  refreshStatus: (invoiceId: string) => apiFetch<{ fe_status: string; ind_estado?: string; error?: string }>(
    '/hacienda/refresh-status', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId }) }),

  /** Consulta y actualiza TODOS los comprobantes en proceso del tenant. */
  refreshPending: () => apiFetch<{ updated: number }>('/hacienda/refresh-pending', { method: 'POST' }),

  /** Emite una Nota de Crédito que anula una factura ya emitida. */
  creditNote: (invoiceId: string, reason?: string) => apiFetch<{ nc_clave?: string }>(
    '/hacienda/credit-note', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, reason }) }),

  debitNote: (invoiceId: string, reason?: string) => apiFetch<{ nd_clave?: string }>(
    '/hacienda/debit-note', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, reason }) }),

  /** Lista los comprobantes electrónicos con su estatus (para el módulo FE Facturas). */
  listInvoices: (params?: { status?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const qs = q.toString();
    return apiFetch<any[]>(`/hacienda/invoices${qs ? '?' + qs : ''}`);
  },

  /** Reenvía la info del comprobante a otro correo. */
  resendEmail: (invoiceId: string, email: string) => apiFetch<{ ok: boolean }>(
    '/hacienda/resend-email', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, email }) }),

  // ── Recepción de comprobantes (Mensaje Receptor) — Alanube ──
  /** Bandeja de comprobantes recibidos de proveedores. */
  listReceived: () => apiFetch<ReceivedDoc[]>('/hacienda/received'),
  /** Registra un comprobante de proveedor en la bandeja (por clave). */
  registerReceived: (body: { clave: string; issuer_id?: string; issuer_name?: string; total?: number; tax?: number; doc_date?: string }) =>
    apiFetch<ReceivedDoc>('/hacienda/received', { method: 'POST', body: JSON.stringify(body) }),
  /** Registra un comprobante subiendo el XML del proveedor (se parsea en el backend). */
  uploadReceivedXml: (xml: string) =>
    apiFetch<ReceivedDoc>('/hacienda/received/upload', { method: 'POST', body: JSON.stringify({ xml }) }),
  /** Envía el Mensaje Receptor: '1' aceptación total, '3' rechazo. */
  confirmReceived: (id: string, state: '1' | '3', reason?: string) =>
    apiFetch<{ ok: boolean; state: string }>('/hacienda/received/confirm',
      { method: 'POST', body: JSON.stringify({ id, state, reason }) }),
  /** Clasifica un recibido como 'gasto' o 'compra' a proveedor. */
  classifyReceived: (id: string, kind: 'gasto' | 'compra') =>
    apiFetch<{ ok: boolean; kind: string }>('/hacienda/received/classify',
      { method: 'POST', body: JSON.stringify({ id, kind }) }),
  /** Convierte un recibido en una compra a proveedor (crea proveedor + compra). */
  receivedToPurchase: (id: string) =>
    apiFetch<{ ok: boolean; purchase_id: string; supplier_id: string }>('/hacienda/received/to-purchase',
      { method: 'POST', body: JSON.stringify({ id }) }),

  /** Proveedor de FE del tenant actual (para ocultar funciones de Alanube). */
  provider: () => apiFetch<{ provider: 'alanube' | 'facturemos'; enabled: boolean }>('/hacienda/provider'),

  /** Cuota de comprobantes del plan (un solo contador: facturas+tiquetes+NC). */
  quota: () => apiFetch<{
    included: number; extra_fee: number; months_elapsed: number; quota_start?: string;
    used: number; used_docs: number; used_nc: number;
    available: number | null; overage: number; extra_charge: number;
  }>('/hacienda/quota'),

  /** POS de FE: crea la factura desde el carrito (precio/IVA editables) y emite. */
  emitDirect: (payload: {
    document_type: 'tiquete_electronico' | 'factura_electronica';
    payment_method: 'cash' | 'card' | 'sinpe' | 'credit';
    session_id?: string | null;
    notes?: string;
    customer?: any;
    lines: Array<{ product_id?: string; name: string; sku?: string; quantity: number; unit_price: number; iva_rate: number; cabys_code?: string; unit?: string }>;
  }) => apiFetch<{ ok: boolean; invoice_id: string; invoice_number: string; clave?: string; consecutivo?: string; tipo?: string }>(
    '/hacienda/emit-direct', { method: 'POST', body: JSON.stringify(payload) }),
};

export default haciendaService;
