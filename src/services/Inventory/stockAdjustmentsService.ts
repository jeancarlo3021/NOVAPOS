import { apiFetch } from '@/lib/api';

export type AdjustmentType =
  | 'increase'
  | 'decrease'
  | 'set'
  | 'damage'
  | 'expired'
  | 'theft'
  | 'return'
  | 'count';

export interface StockAdjustment {
  id: string;
  tenant_id: string;
  product_id: string;
  user_id?: string | null;
  user_email?: string | null;
  type: AdjustmentType;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  notes?: string | null;
  created_at: string;
  product?: { id: string; name: string; sku?: string };
  /** Anulado: su efecto en el stock ya se revirtió y no cuenta en los totales. */
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  /** De dónde salió: 'manual' se puede anular acá, lo demás no. */
  source?: string | null;
  /** Agrupa las líneas de una misma merma o toma física. */
  batch_id?: string | null;
}

export interface AnulacionMovimiento {
  anulados: number;
  movimientos: Array<{ id: string; product_id: string; quantity: number; stock_queda: number }>;
  /** Productos que quedaron en negativo: la mercadería de esa entrada ya salió. */
  negativos: Array<{ product_id: string; stock: number }>;
  fallaron: Array<{ id: string; error: string }>;
  aviso: string | null;
}

export const stockAdjustmentsService = {
  async list(params: {
    productId?: string;
    from?: string;
    to?: string;
    type?: AdjustmentType;
    /** Nombre o código del producto: lo resuelve el servidor. */
    search?: string;
    /** Tope de filas. Por omisión 1000 (lo que el servidor devolvía callado). */
    limit?: number;
  } = {}): Promise<StockAdjustment[]> {
    const qs = new URLSearchParams();
    if (params.productId) qs.set('product_id', params.productId);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.type) qs.set('type', params.type);
    if (params.search?.trim()) qs.set('search', params.search.trim());
    if (params.limit) qs.set('limit', String(params.limit));
    const url = `/stock-adjustments${qs.toString() ? '?' + qs.toString() : ''}`;
    return apiFetch<StockAdjustment[]>(url);
  },

  async create(payload: {
    product_id: string;
    type: AdjustmentType;
    quantity: number;
    reason: string;
    notes?: string;
    user_email?: string;
  }): Promise<StockAdjustment> {
    return apiFetch<StockAdjustment>('/stock-adjustments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Toma física: aplica un conteo completo en lote (ajustes tipo 'count'). */
  async physicalCount(payload: {
    counts: Array<{ product_id: string; counted: number }>;
    notes?: string;
    user_email?: string;
  }): Promise<PhysicalCountResult> {
    return apiFetch<PhysicalCountResult>('/stock-adjustments/physical-count', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * ANULA un movimiento (ajuste o merma) y revierte su efecto en el stock.
   *
   * `enLote` anula toda la merma o toda la toma física que se registró de una
   * sola vez: botar cinco cosas al cierre de cocina es un acto, no cinco.
   *
   * El movimiento no se borra: queda en la bitácora con quién lo anuló y por
   * qué, y deja de contar en los totales y en el kardex.
   */
  async anular(id: string, opciones: { motivo?: string; enLote?: boolean } = {}): Promise<AnulacionMovimiento> {
    const qs = opciones.enLote ? '?batch=1' : '';
    return apiFetch<AnulacionMovimiento>(`/stock-adjustments/${id}/void${qs}`, {
      method: 'POST',
      body: JSON.stringify({ reason: opciones.motivo ?? '' }),
    });
  },

  /** Kardex (tarjeta de existencias) de un producto con saldo corrido. */
  async kardex(productId: string, from?: string, to?: string): Promise<KardexResult> {
    const qs = new URLSearchParams({ product_id: productId });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return apiFetch<KardexResult>(`/stock-adjustments/kardex?${qs.toString()}`);
  },
};

export interface KardexRow {
  date: string;
  kind: string;      // tipo de movimiento (sale, count, increase, damage…)
  label: string;
  ref: string;       // # de documento (factura, etc.)
  in: number;
  out: number;
  balance: number;   // saldo después del movimiento
}

export interface KardexResult {
  product: { id: string; name: string; sku?: string; tracks_stock?: boolean };
  opening: number;
  closing: number;
  total_in: number;
  total_out: number;
  rows: KardexRow[];
}

export interface PhysicalCountResult {
  counted: number;
  adjusted: number;
  units_before: number;
  units_after: number;
  diff_units: number;
  items: Array<{
    product_id: string; name: string; sku?: string;
    stock_before: number; counted: number; diff: number;
  }>;
}
