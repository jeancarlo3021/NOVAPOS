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
};
