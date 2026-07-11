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

export type PromoType    = 'percentage' | 'fixed' | '2x1' | 'combo';
export type PromoScope   = 'all' | 'category' | 'products';
export type PromoStatus  = 'active' | 'scheduled' | 'expired' | 'inactive';
export type ComboMode    = 'price' | 'percent';   // precio fijo del combo / % de descuento

export interface Promotion {
  id:          string;
  tenant_id:   string;
  name:        string;
  description: string | null;
  type:        PromoType;
  value:       number;
  combo_mode?: ComboMode | null;
  applies_to:  PromoScope;
  category_id: string | null;
  product_ids: string[];
  starts_at:   string;         // YYYY-MM-DD
  ends_at:     string | null;  // YYYY-MM-DD · null/'' = permanente
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
  combo_mode?: ComboMode | null;
  applies_to:  PromoScope;
  category_id: string | null;
  product_ids: string[];
  starts_at:   string;
  ends_at:     string;
  is_active:   boolean;
}

// ── Status helper ─────────────────────────────────────────────────────────────

/** Fecha de HOY en hora de Costa Rica (YYYY-MM-DD). Evita que las promos se
 *  corran de día cerca de medianoche por usar UTC. */
export const todayCR = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

export function getPromoStatus(p: Promotion): PromoStatus {
  if (!p.is_active) return 'inactive';
  const today = todayCR();
  // ends_at vacío/null = permanente (no vence).
  if (p.ends_at && p.ends_at < today) return 'expired';
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
  if (promo.type === 'combo')      return promo.combo_mode === 'percent'
                                     ? `Combo -${promo.value}%`
                                     : `Combo ₡${Number(promo.value).toLocaleString('es-CR')}`;
  return '';
}

// ── Combos / grupos de promos (nivel carrito) ───────────────────────────────────
// Un combo es una promoción type='combo' cuyos product_ids son los productos que
// deben estar juntos en el carrito. Cuando están todos, se aplica un precio único
// (combo_mode='price') o un % de descuento (combo_mode='percent') sobre la suma de
// los productos del combo. Se aplica por cada "set" completo presente en el carrito.

export interface ComboCartItem {
  product_id: string;
  unit_price: number;
  quantity:   number;
}

export interface AppliedCombo {
  promo:    Promotion;
  label:    string;
  sets:     number;   // cuántos combos completos se armaron
  discount: number;   // descuento total en ₡ que aporta este combo
}

/**
 * Detecta combos completos en el carrito y calcula el descuento total.
 * Asume 1 unidad de cada producto del combo por set.
 */
export function computeCartCombos(
  items: ComboCartItem[],
  promotions: Promotion[],
): { discount: number; applied: AppliedCombo[] } {
  const today = todayCR();
  const combos = promotions.filter(
    p => p.type === 'combo' &&
      Array.isArray(p.product_ids) && p.product_ids.length >= 2 &&
      p.is_active && p.starts_at <= today && (!p.ends_at || p.ends_at >= today)
  );

  const applied: AppliedCombo[] = [];
  let discount = 0;

  for (const promo of combos) {
    // ¿Están todos los productos del combo en el carrito? ¿Cuántos sets completos?
    let sets = Infinity;
    let setUnitTotal = 0;
    let missing = false;
    for (const pid of promo.product_ids) {
      const it = items.find(i => i.product_id === pid);
      if (!it || it.quantity < 1) { missing = true; break; }
      sets = Math.min(sets, Math.floor(it.quantity));
      setUnitTotal += it.unit_price;
    }
    if (missing || !isFinite(sets) || sets < 1) continue;

    // 'percent' → siempre descuento (≥0).
    // 'price'   → el combo cuesta EXACTAMENTE promo.value por set; el ajuste puede
    //             ser positivo (ahorro) o negativo (recargo) según el precio à la carte.
    const perSet = promo.combo_mode === 'percent'
      ? setUnitTotal * (promo.value / 100)
      : setUnitTotal - promo.value;
    const comboDiscount = Math.round(perSet * sets);
    if (comboDiscount === 0) continue;

    discount += comboDiscount;
    applied.push({ promo, label: promo.name || promoLabel(promo), sets, discount: comboDiscount });
  }

  return { discount: Math.round(discount), applied };
}

/** Returns the first applicable promotion for a product (priority: products > category > all) */
export function getProductPromotion(
  productId: string,
  categoryId: string | null | undefined,
  promotions: Promotion[],
): Promotion | null {
  const today  = todayCR();
  const active = promotions.filter(
    // Los combos se resuelven a nivel de carrito (computeCartCombos), no por producto.
    p => p.type !== 'combo' && p.is_active && p.starts_at <= today && (!p.ends_at || p.ends_at >= today)
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
