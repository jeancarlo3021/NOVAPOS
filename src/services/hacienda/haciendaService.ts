import { apiFetch } from '@/lib/api';
import { BULK_CHUNK_SIZE, chunked } from '@/utils/bulkChunks';

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
  /** Id del Mensaje Receptor en Alanube. Null = se aceptó en el sistema pero
   *  NUNCA se declaró a Hacienda (falló el envío o el tenant no usa Alanube). */
  ack_id?: string | null;
  kind?: 'gasto' | 'compra' | null;
  items?: ReceivedItem[] | null;
  /** Origen del comprobante: 'email' (cron por correo), 'manual', 'alanube'. */
  source?: string | null;
  /** Remitente del correo del que llegó (cuando source='email'). */
  email_from?: string | null;
  /** Borrador de compra ya creado automáticamente (cuando llega por correo). */
  purchase_id?: string | null;
  /** N° de orden de compra consecutivo (PO-XXXX) una vez confirmada la compra. */
  purchase_number?: string | null;
  raw?: any;
}

export interface ReceivedMatchLine {
  detail: string;
  quantity: number;
  unit_price: number;
  total: number;
  cabys?: string | null;
  code?: string | null;
  product_id: string | null;
  product_name: string | null;
  exists: boolean;
  matched_by?: 'cabys' | 'sku' | 'name' | null;
}
export interface ReceivedPurchaseOrder {
  id: string; purchase_number: string; purchase_date: string; total_amount: number; status: string;
}
export interface ReceivedMatch {
  id: string; clave: string | null; issuer_name: string | null; issuer_id: string | null;
  total: number; supplier_id: string | null;
  lines: ReceivedMatchLine[];
  orders: ReceivedPurchaseOrder[];
  linked_purchase_id: string | null;
}
export interface ReconcileBody {
  id: string;
  purchase_id?: string | null;
  /** No afectar el stock del inventario con los productos creados. */
  no_inventory?: boolean;
  /** La compra NO genera productos de catálogo (insumos de proceso), pero su monto
   *  sí se registra en la orden de compra. */
  no_products?: boolean;
  items: Array<{
    detail: string; quantity: number; unit_price: number; total?: number;
    cabys?: string | null; product_id?: string | null;
    action: 'update' | 'create' | 'skip'; no_stock?: boolean;
    /** Precio de venta ya calculado (costo × margen), redondeado al colón. */
    sale_price?: number;
    /** Segundo código del producto (barras / proveedor). null = no tocarlo. */
    sku2?: string | null;
    /** Escribir `sale_price` en el producto. En los que ya existen va apagado
     *  salvo que el usuario lo pida: si no, una compra reescribiría precios. */
    reprice?: boolean;
  }>;
  /**
   * Conciliación por lotes (ver `reconcileReceivedInBatches`).
   *  · 'products' → procesa este lote de líneas y devuelve las resueltas.
   *  · 'finish'   → arma la orden con las líneas acumuladas de todos los lotes.
   * Sin `stage` va todo en una sola llamada (comportamiento de siempre).
   */
  stage?: 'products' | 'finish';
  /** Solo en 'finish': líneas ya resueltas por los lotes anteriores. */
  lines?: ReconciledLine[];
  /** Solo en 'finish': monto de las líneas que no generan producto. */
  skipped_total?: number;
  /** Solo en 'finish': conteos acumulados, para el mensaje de resumen. */
  created?: number;
  updated?: number;
}

/** Línea ya resuelta a un producto real, lista para entrar a la orden de compra. */
export interface ReconciledLine {
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/** Reporte de trazabilidad de consecutivos (para respaldar una fiscalización). */
export interface ConsecutivoAudit {
  generado: string;
  desde: string | null;
  hasta: string | null;
  total_documentos: number;
  resumen: { huecos_sin_explicar: number; repetidos: number };
  series: Array<{
    serie: string; tipo: string; tipo_label: string;
    emitidos: number; desde: number; hasta: number;
    huecos_total: number; huecos_explicados: number; huecos_sin_explicar: number;
    repetidos: number[];
    huecos: Array<{
      numero: number; explicado: boolean;
      usado_por: Array<{ tipo: string; consecutivo: string; clave: string; fecha: string; total: number }>;
    }>;
    documentos: Array<{
      tipo_label: string; numero: number; consecutivo: string; clave: string;
      fecha: string; total: number; estado: string; factura: string;
    }>;
  }>;
}

export const haciendaService = {
  /** Verifica la conexión con Facturemos (token + emisor). */
  testConnection: () => apiFetch<{ token_ok: boolean; emisor_configured: boolean; message?: string }>(
    '/hacienda/test-connection', { method: 'POST' }),

  /** Emite un documento electrónico a Hacienda (vía Facturemos) por su factura. */
  /** `warning` avisa de líneas que quedaron fuera del comprobante (sin precio). */
  emit: (invoiceId: string) => apiFetch<{ clave?: string; consecutivo?: string; response?: any; warning?: string | null }>(
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
  /**
   * Reenvía un comprobante por correo.
   *
   * `kind` decide cuál: la factura, su nota de crédito o su nota de débito. Sin
   * él siempre iba la factura, así que una NC no se podía reenviar nunca.
   */
  resendEmail: (invoiceId: string, email: string, kind: 'invoice' | 'nc' | 'nd' = 'invoice') =>
    apiFetch<{ ok: boolean; kind: string; pdf: boolean; warning: string | null }>(
      '/hacienda/resend-email',
      { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, email, kind }) }),

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
  /** Reenvía a Hacienda el mensaje receptor que quedó sin enviar. */
  resendReceivedAck: (id: string) =>
    apiFetch<{ ok: boolean; ack_id: string }>(`/hacienda/received/${id}/resend-ack`, { method: 'POST' }),

  classifyReceived: (id: string, kind: 'gasto' | 'compra') =>
    apiFetch<{ ok: boolean; kind: string }>('/hacienda/received/classify',
      { method: 'POST', body: JSON.stringify({ id, kind }) }),
  /**
   * Trazabilidad de la numeración: qué se emitió por serie y tipo, qué números
   * faltan y quién consumió cada uno de los que faltan.
   */
  consecutivoAudit: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const qs = p.toString();
    return apiFetch<ConsecutivoAudit>(`/hacienda/consecutivo-audit${qs ? '?' + qs : ''}`);
  },

  /**
   * Marca de una vez todos los comprobantes sin categorizar.
   * Solo escribe la etiqueta: no crea órdenes de compra ni confirma a Hacienda.
   */
  classifyAllReceived: (kind: 'gasto' | 'compra' = 'compra') =>
    apiFetch<{ updated: number; kind: string }>('/hacienda/received/classify-all',
      { method: 'POST', body: JSON.stringify({ kind }) }),

  /**
   * Acepta una NOTA DE CRÉDITO del proveedor.
   *
   * `restock` decide si además sale mercadería del inventario: true cuando se
   * devolvió producto, false cuando la nota es solo un descuento posterior.
   * En los dos casos resta crédito fiscal del período.
   */
  acceptCreditNote: (id: string, restock: boolean) =>
    apiFetch<{ ok: boolean; restocked: number; items: any[]; messages: string[] }>(
      '/hacienda/received/credit-note',
      { method: 'POST', body: JSON.stringify({ id, restock }) }),

  /** Convierte un recibido en una compra a proveedor (crea proveedor + compra). */
  receivedToPurchase: (id: string) =>
    apiFetch<{ ok: boolean; purchase_id: string; supplier_id: string }>('/hacienda/received/to-purchase',
      { method: 'POST', body: JSON.stringify({ id }) }),

  /** Trae el comprobante con líneas emparejadas a productos + órdenes de compra del proveedor. */
  matchReceived: (id: string) =>
    apiFetch<ReceivedMatch>(`/hacienda/received/${id}/match`),

  /** Aplica la conciliación: crea/actualiza productos, crea/relaciona orden de compra. */
  reconcileReceived: (body: ReconcileBody) =>
    apiFetch<{ ok: boolean; purchase_id: string; created: number; updated: number; messages: string[] }>(
      '/hacienda/received/reconcile', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Conciliación POR LOTES — la que hay que usar desde la pantalla.
   *
   * Un comprobante de proveedor con 250 líneas tumbaba la conciliación: cada
   * línea es una consulta a la base, y todas juntas pasaban del tiempo máximo de
   * la petición. El proxy la cortaba y el usuario veía un error… con la mitad de
   * los productos ya creados y ninguna orden de compra.
   *
   * Acá las líneas van en tandas de 50. Cada tanda es una petición corta que
   * devuelve sus líneas ya resueltas a producto; cuando terminan todas, una
   * última llamada arma la orden de compra con el total completo.
   *
   * El orden importa: la orden se crea AL FINAL, nunca por lote. Si un lote
   * falla, no quedó ninguna orden a medias que haya que ir a borrar a mano.
   */
  reconcileReceivedInBatches: async (
    body: ReconcileBody,
    onProgress?: (done: number, total: number) => void,
  ) => {
    const total = body.items.length;
    // Pocas líneas: una sola llamada, como siempre. No tiene sentido pagar dos
    // viajes de red por un comprobante de 6 artículos.
    if (total <= BULK_CHUNK_SIZE) {
      onProgress?.(0, total);
      const res = await haciendaService.reconcileReceived(body);
      onProgress?.(total, total);
      return res;
    }

    const lines: ReconciledLine[] = [];
    let skipped = 0, created = 0, updated = 0;
    const warnings: string[] = [];
    let done = 0;
    onProgress?.(0, total);

    for (const batch of chunked(body.items, BULK_CHUNK_SIZE)) {
      const r = await apiFetch<{
        lines: ReconciledLine[]; skipped_total: number;
        created: number; updated: number; messages: string[];
      }>('/hacienda/received/reconcile', {
        method: 'POST',
        body: JSON.stringify({ ...body, items: batch, stage: 'products' }),
      });
      lines.push(...(r.lines ?? []));
      skipped += r.skipped_total ?? 0;
      created += r.created ?? 0;
      updated += r.updated ?? 0;
      // De los mensajes por línea solo interesan los problemas: 250 líneas de
      // «➕ Creado» no las lee nadie y esconderían justo lo que falló.
      warnings.push(...(r.messages ?? []).filter(m => m.startsWith('⚠️')));
      done += batch.length;
      onProgress?.(done, total);
    }

    const res = await apiFetch<{ ok: boolean; purchase_id: string; created: number; updated: number; messages: string[] }>(
      '/hacienda/received/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          id: body.id, purchase_id: body.purchase_id,
          no_inventory: body.no_inventory, no_products: body.no_products,
          items: [], stage: 'finish',
          lines, skipped_total: skipped, created, updated,
        }),
      });
    return { ...res, messages: [...(res.messages ?? []), ...warnings] };
  },

  /** Proveedor de FE del tenant actual (para ocultar funciones de Alanube). */
  provider: () => apiFetch<{ provider: 'alanube' | 'facturemos'; enabled: boolean }>('/hacienda/provider'),

  /**
   * XML firmado y respuesta de Hacienda (base64). El XML es el comprobante que
   * vale legalmente; el PDF es solo su representación gráfica.
   */
  feXml: (invoiceId: string) => apiFetch<{
    xml: string | null; xmlHacienda: string | null;
    filename: string; filename_hacienda: string;
  }>(`/hacienda/fe-xml/${invoiceId}`),

  /** PDF generado por Alanube (base64) para el comprobante. */
  alanubePdf: (invoiceId: string) =>
    apiFetch<{ pdf: string; filename: string }>(`/hacienda/fe-pdf/${invoiceId}`),

  /** Cuota de comprobantes del plan (un solo contador: facturas+tiquetes+NC). */
  quota: () => apiFetch<{
    /** Bolsa TOTAL disponible: la del plan más lo que sobró de la anterior. */
    included: number;
    /** Lo que trae el plan por sí solo. */
    included_plan?: number;
    /** Comprobantes arrastrados de la bolsa anterior al renovar. */
    carryover?: number;
    extra_fee: number; months_elapsed: number; quota_start?: string;
    used: number; used_docs: number; used_nc: number;
    available: number | null; overage: number; extra_charge: number;
  }>('/hacienda/quota'),

  /**
   * Prueba en seco: arma el comprobante con los datos REALES pero con un
   * consecutivo imaginario, sin guardar la factura ni enviar nada a Hacienda.
   */
  emitPreview: (payload: any) => apiFetch<{
    preview: true; provider: string; tipo: string; document_type: string;
    consecutivo_imaginario: string; proximo_consecutivo_real: string;
    ambiente: string;
    totales: { subtotal: number; iva: number; total: number };
    lineas: number;
    faltantes: string[];
    documento: any;
  }>('/hacienda/emit-direct', {
    method: 'POST', body: JSON.stringify({ ...payload, preview: true }),
  }),

  /** POS de FE: crea la factura desde el carrito (precio/IVA editables) y emite. */
  emitDirect: (payload: {
    document_type: 'tiquete_electronico' | 'factura_electronica';
    /**
     * Medio de pago del comprobante. Son los que Hacienda reconoce por código:
     * efectivo, tarjeta, cheque, transferencia, recaudado por terceros (las
     * plataformas de delivery), SINPE móvil y plataformas digitales.
     */
    payment_method:
      'cash' | 'card' | 'sinpe' | 'transfer' | 'check' | 'third_party' | 'digital' | 'credit';
    session_id?: string | null;
    notes?: string;
    customer?: any;
    lines: Array<{ product_id?: string; name: string; sku?: string; quantity: number; unit_price: number; iva_rate: number; cabys_code?: string; unit?: string }>;
  }) => apiFetch<{ ok: boolean; invoice_id: string; invoice_number: string; clave?: string; consecutivo?: string; tipo?: string }>(
    '/hacienda/emit-direct', { method: 'POST', body: JSON.stringify(payload) }),
};

export default haciendaService;
