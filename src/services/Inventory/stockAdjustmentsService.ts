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
}

export const stockAdjustmentsService = {
  async list(params: {
    productId?: string;
    from?: string;
    to?: string;
    type?: AdjustmentType;
  } = {}): Promise<StockAdjustment[]> {
    const qs = new URLSearchParams();
    if (params.productId) qs.set('product_id', params.productId);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.type) qs.set('type', params.type);
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
