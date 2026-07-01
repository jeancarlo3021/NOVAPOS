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
};

export default haciendaService;
