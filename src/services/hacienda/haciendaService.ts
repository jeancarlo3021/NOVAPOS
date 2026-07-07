import { apiFetch } from '@/lib/api';

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
