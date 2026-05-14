import { apiFetch } from '@/lib/api';

/*
  SQL migration — run once in Supabase SQL editor:

  CREATE TABLE IF NOT EXISTS promotions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    type         TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' | 'fixed' | '2x1'
    value        NUMERIC(10,2) NOT NULL DEFAULT 0,   -- % or ₡ amount (unused for 2x1)
    applies_to   TEXT NOT NULL DEFAULT 'all',        -- 'all' | 'category' | 'products'
    category_id  UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    product_ids  UUID[] DEFAULT '{}',
    starts_at    DATE NOT NULL,
    ends_at      DATE NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
*/

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromoType    = 'percentage' | 'fixed' | '2x1';
export type PromoScope   = 'all' | 'category' | 'products';
export type PromoStatus  = 'active' | 'scheduled' | 'expired' | 'inactive';

export interface Promotion {
  id:          string;
  tenant_id:   string;
  name:        string;
  description: string | null;
  type:        PromoType;
  value:       number;
  applies_to:  PromoScope;
  category_id: string | null;
  product_ids: string[];
  starts_at:   string;  // YYYY-MM-DD
  ends_at:     string;  // YYYY-MM-DD
  is_active:   boolean;
  created_at:  string;
  updated_at:  string;
  // joined
  category?: { id: string; name: string; color: string; icon: string } | null;
}

export interface PromotionPayload {
  name:        string;
  description: string | null;
  type:        PromoType;
  value:       number;
  applies_to:  PromoScope;
  category_id: string | null;
  product_ids: string[];
  starts_at:   string;
  ends_at:     string;
  is_active:   boolean;
}

// ── Status helper ─────────────────────────────────────────────────────────────

export function getPromoStatus(p: Promotion): PromoStatus {
  if (!p.is_active) return 'inactive';
  const today = new Date().toISOString().slice(0, 10);
  if (p.ends_at < today) return 'expired';
  if (p.starts_at > today) return 'scheduled';
  return 'active';
}

// ── Discount helpers ──────────────────────────────────────────────────────────

export function calcPromoUnitPrice(unitPrice: number, promo: Promotion): number {
  if (promo.type === 'percentage') return unitPrice * (1 - promo.value / 100);
  if (promo.type === 'fixed')      return Math.max(0, unitPrice - promo.value);
  return unitPrice; // 2x1: effective price depends on quantity, applied at subtotal level
}

export function calcPromoSubtotal(unitPrice: number, quantity: number, promo: Promotion): number {
  if (promo.type === 'percentage') return unitPrice * (1 - promo.value / 100) * quantity;
  if (promo.type === 'fixed')      return Math.max(0, unitPrice - promo.value) * quantity;
  if (promo.type === '2x1')        return Math.ceil(quantity / 2) * unitPrice;
  return unitPrice * quantity;
}

export function promoLabel(promo: Promotion): string {
  if (promo.type === 'percentage') return `${promo.value}% desc.`;
  if (promo.type === 'fixed')      return `-₡${Number(promo.value).toLocaleString('es-CR')}`;
  if (promo.type === '2x1')        return '2×1';
  return '';
}

/** Returns the first applicable promotion for a product (priority: products > category > all) */
export function getProductPromotion(
  productId: string,
  categoryId: string | null | undefined,
  promotions: Promotion[],
): Promotion | null {
  const today  = new Date().toISOString().slice(0, 10);
  const active = promotions.filter(
    p => p.is_active && p.starts_at <= today && p.ends_at >= today
  );
  return (
    active.find(p => p.applies_to === 'products' && p.product_ids.includes(productId)) ??
    (categoryId
      ? active.find(p => p.applies_to === 'category' && p.category_id === categoryId)
      : null) ??
    active.find(p => p.applies_to === 'all') ??
    null
  );
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const promotionsService = {

  async getAll(_tenantId: string): Promise<Promotion[]> {
    return apiFetch<Promotion[]>('/promotions');
  },

  async getActiveToday(_tenantId: string): Promise<Promotion[]> {
    return apiFetch<Promotion[]>('/promotions/active');
  },

  async create(_tenantId: string, payload: PromotionPayload): Promise<Promotion> {
    return apiFetch<Promotion>('/promotions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id: string, payload: Partial<PromotionPayload>): Promise<Promotion> {
    return apiFetch<Promotion>('/promotions/' + id, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async toggleActive(id: string, _is_active: boolean): Promise<void> {
    await apiFetch('/promotions/' + id + '/toggle', { method: 'PATCH' });
  },

  async delete(id: string): Promise<void> {
    await apiFetch('/promotions/' + id, { method: 'DELETE' });
  },
};
