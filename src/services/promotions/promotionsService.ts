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

export type PromoType    = 'percentage' | 'fixed' | '2x1' | 'combo' | 'qty_bundle' | 'second_half';
/**
 * A CUÁL del par se le descuenta, cuando los dos productos no valen lo mismo.
 *
 * 'barato' es lo que hace el supermercado: el 50% se le aplica al más barato de
 * los dos. 'caro' es la versión generosa. No es un detalle: con una camisa de
 * ₡12.000 y otra de ₡8.000, el cliente ahorra ₡4.000 o ₡6.000 según cuál sea,
 * así que lo elige el negocio y no el programa.
 */
export type SecondRule   = 'barato' | 'caro';
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
  /** Promo por cantidad: unidades/kg del paquete. `value` es su precio. */
  bundle_qty?: number | null;
  /** Segunda unidad: a cuál del par se le descuenta. Por defecto, al más barato. */
  second_rule?: SecondRule | null;
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
  bundle_qty?: number | null;
  second_rule?: SecondRule | null;
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
  // 2x1 y qty_bundle dependen de la cantidad: se resuelven en el subtotal.
  return unitPrice;
}

/**
 * Promo por cantidad: "2 kg por ₡1000".
 *
 * Se cobra el precio del paquete por cada múltiplo COMPLETO y lo que sobra va a
 * precio normal — que es como lo entiende el cliente en el mostrador:
 *   1 kg → normal · 2 kg → ₡1000 · 3 kg → ₡1000 + 1 normal · 4 kg → ₡2000
 *
 * El redondeo a 3 decimales es para el peso: sin él, 0.1+0.2 deja un sobrante
 * fantasma y 3 kg terminaría cobrando un gramo de más.
 */
export function calcQtyBundleSubtotal(unitPrice: number, quantity: number, promo: Promotion): number {
  const packQty = Number(promo.bundle_qty ?? 0);
  const packPrice = Number(promo.value ?? 0);
  if (!(packQty > 0)) return unitPrice * quantity;   // mal configurada: precio normal

  const packs = Math.floor(Math.round((quantity / packQty) * 1000) / 1000);
  if (packs < 1) return unitPrice * quantity;
  const rest = Math.max(0, Math.round((quantity - packs * packQty) * 1000) / 1000);
  return packs * packPrice + rest * unitPrice;
}

export function calcPromoSubtotal(unitPrice: number, quantity: number, promo: Promotion): number {
  if (promo.type === 'percentage') return unitPrice * (1 - promo.value / 100) * quantity;
  if (promo.type === 'fixed')      return Math.max(0, unitPrice - promo.value) * quantity;
  if (promo.type === '2x1')        return Math.ceil(quantity / 2) * unitPrice;
  if (promo.type === 'qty_bundle') return calcQtyBundleSubtotal(unitPrice, quantity, promo);
  return unitPrice * quantity;
}

export function promoLabel(promo: Promotion): string {
  if (promo.type === 'percentage') return `${promo.value}% desc.`;
  if (promo.type === 'fixed')      return `-₡${Number(promo.value).toLocaleString('es-CR')}`;
  if (promo.type === '2x1')        return '2×1';
  if (promo.type === 'qty_bundle')
    return `${Number(promo.bundle_qty ?? 0)} × ₡${Number(promo.value).toLocaleString('es-CR')}`;
  if (promo.type === 'second_half') {
    const pct = Number(promo.value ?? 50);
    return pct === 50 ? '2ª a mitad de precio' : `2ª a -${pct}%`;
  }
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
  /**
   * Tarifa de IVA de la línea, en %. Con ella el precio del combo se toma CON el
   * impuesto incluido. Sin ella se asume 0 (comportamiento anterior).
   */
  iva_pct?:   number;
}

export interface AppliedCombo {
  promo:    Promotion;
  label:    string;
  sets:     number;   // cuántos combos completos se armaron
  discount: number;   // descuento total en ₡ que aporta este combo, CON IVA
  /** El mismo descuento expresado sobre la base SIN IVA (lo que baja la línea). */
  discount_base: number;
}

/**
 * Detecta combos completos en el carrito y calcula el descuento total.
 * Asume 1 unidad de cada producto del combo por set.
 */
export function computeCartCombos(
  items: ComboCartItem[],
  promotions: Promotion[],
): { discount: number; applied: AppliedCombo[]; basePorProducto: Record<string, number> } {
  const today = todayCR();
  const combos = promotions.filter(
    p => p.type === 'combo' &&
      Array.isArray(p.product_ids) && p.product_ids.length >= 2 &&
      p.is_active && p.starts_at <= today && (!p.ends_at || p.ends_at >= today)
  );

  const applied: AppliedCombo[] = [];
  let discount = 0;
  const basePorProducto: Record<string, number> = {};
  const r2 = (n: number) => Math.round(n * 100) / 100;

  for (const promo of combos) {
    // ¿Están todos los productos del combo en el carrito? ¿Cuántos sets completos?
    let sets = Infinity;
    let setConIva = 0;
    let missing = false;
    const miembros: Array<{ pid: string; conIva: number; factor: number }> = [];
    for (const pid of promo.product_ids) {
      const it = items.find(i => i.product_id === pid);
      if (!it || it.quantity < 1) { missing = true; break; }
      sets = Math.min(sets, Math.floor(it.quantity));
      /**
       * El precio del combo es precio FINAL, con el IVA incluido.
       *
       * Así lo anuncia el negocio y así lo espera el cliente: «combo a ₡4.000»
       * es lo que paga. Antes se comparaba contra los precios SIN impuesto y
       * después se le sumaba el IVA completo, y el cliente terminaba pagando
       * ₡4.520. En modo porcentaje pasaba lo mismo: el descuento salía de la
       * base y quedaba corto.
       */
      const factor = 1 + (Number(it.iva_pct) || 0) / 100;
      const conIva = it.unit_price * factor;
      setConIva += conIva;
      miembros.push({ pid, conIva, factor });
    }
    if (missing || !isFinite(sets) || sets < 1) continue;

    // 'percent' → siempre descuento (≥0).
    // 'price'   → el combo cuesta EXACTAMENTE promo.value por set; el ajuste puede
    //             ser positivo (ahorro) o negativo (recargo) según el precio à la carte.
    const perSet = promo.combo_mode === 'percent'
      ? setConIva * (promo.value / 100)
      : setConIva - promo.value;
    const comboDiscount = r2(perSet * sets);
    if (comboDiscount === 0) continue;

    /**
     * El descuento se REPARTE entre los productos del combo y se lleva a su base.
     *
     * Cada uno aporta en proporción a su precio con IVA, y esa parte se divide
     * entre su propio factor de impuesto: un combo puede mezclar tarifas (una
     * bebida al 13% con un producto de canasta al 1%). Bajar la base de cada
     * línea —en vez de restar un monto suelto al final— es lo que hace que el IVA
     * se calcule sobre lo que de verdad se cobró, y que el comprobante que va a
     * Hacienda cuadre con el total.
     */
    let baseCombo = 0;
    for (const m of miembros) {
      const parte = setConIva > 0 ? comboDiscount * (m.conIva / setConIva) : 0;
      const base = r2(parte / m.factor);
      basePorProducto[m.pid] = r2((basePorProducto[m.pid] ?? 0) + base);
      baseCombo += base;
    }

    discount += comboDiscount;
    applied.push({
      promo, label: promo.name || promoLabel(promo), sets,
      discount: comboDiscount, discount_base: r2(baseCombo),
    });
  }

  return { discount: r2(discount), applied, basePorProducto };
}

// ── Segunda unidad a mitad de precio (nivel carrito) ───────────────────

export interface SegundaUnidadItem extends ComboCartItem {
  /** Para las promos por categoría: a qué categoría pertenece el producto. */
  category_id?: string | null;
}

export interface AppliedSegundaUnidad {
  promo:    Promotion;
  label:    string;
  /** Cuántos pares se armaron: uno por cada dos unidades que entran. */
  pares:    number;
  /** Descuento total, CON IVA (lo que el cliente ve que se le bajó). */
  discount: number;
  /** El mismo descuento sobre la base SIN IVA (lo que baja cada línea). */
  discount_base: number;
  /** Lo que se le descontó por par, para poder explicarlo en pantalla. */
  detalle: Array<{ product_id: string; monto: number }>;
}

/** ¿Esta línea entra en la promo? Mismo criterio de alcance que el resto. */
const entraEnPromo = (promo: Promotion, it: SegundaUnidadItem): boolean => {
  if (promo.applies_to === 'products') return (promo.product_ids ?? []).includes(it.product_id);
  if (promo.applies_to === 'category') return !!promo.category_id && it.category_id === promo.category_id;
  return true;   // 'all'
};

/**
 * «LA SEGUNDA A MITAD DE PRECIO», con los productos que de verdad hay en la cuenta.
 *
 * No es un descuento por línea: dos camisas distintas forman un par igual que
 * dos iguales, así que hay que mirar el carrito completo. Las unidades se
 * ordenan de más cara a más barata y se emparejan de dos en dos; el descuento
 * se le hace al más barato o al más caro de cada par, según lo que eligió el
 * negocio al crear la promo.
 *
 * Lo que sobra sin pareja se cobra normal: con tres unidades hay UN par y una
 * suelta, que es como lo entiende el cliente en la caja.
 *
 * Las cantidades con decimales (lo que se vende por peso) no entran: «la
 * segunda» no significa nada con 1,4 kg de queso.
 */
export function computeSegundaUnidad(
  items: SegundaUnidadItem[],
  promotions: Promotion[],
): { discount: number; applied: AppliedSegundaUnidad[]; basePorProducto: Record<string, number> } {
  const hoy = todayCR();
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const promos = promotions.filter(
    p => p.type === 'second_half' && p.is_active
      && p.starts_at <= hoy && (!p.ends_at || p.ends_at >= hoy),
  );

  const applied: AppliedSegundaUnidad[] = [];
  const basePorProducto: Record<string, number> = {};
  let discount = 0;
  /* Un producto no entra en dos promos de segunda unidad: si dos promos lo
     alcanzan, la primera se lo lleva y la otra no lo vuelve a descontar. */
  const yaUsados = new Set<string>();

  for (const promo of promos) {
    const pct = Math.min(100, Math.max(0, Number(promo.value ?? 50) || 50));
    if (pct <= 0) continue;
    const regla: SecondRule = promo.second_rule === 'caro' ? 'caro' : 'barato';

    /** Una entrada por UNIDAD: así se pueden emparejar entre productos distintos. */
    const unidades: Array<{ pid: string; conIva: number; factor: number }> = [];
    for (const it of items) {
      if (yaUsados.has(it.product_id)) continue;
      if (!entraEnPromo(promo, it)) continue;
      const enteras = Math.floor(Number(it.quantity) || 0);
      if (enteras < 1) continue;
      const factor = 1 + (Number(it.iva_pct) || 0) / 100;
      const conIva = (Number(it.unit_price) || 0) * factor;
      if (conIva <= 0) continue;
      for (let k = 0; k < enteras; k++) unidades.push({ pid: it.product_id, conIva, factor });
    }
    if (unidades.length < 2) continue;

    unidades.sort((a, b) => b.conIva - a.conIva);   // de la más cara a la más barata
    const pares = Math.floor(unidades.length / 2);

    let conIvaTotal = 0, baseTotal = 0;
    const detalle: Array<{ product_id: string; monto: number }> = [];
    for (let i = 0; i < pares; i++) {
      const caro = unidades[i * 2];
      const barato = unidades[i * 2 + 1];
      const elegida = regla === 'caro' ? caro : barato;
      const monto = r2(elegida.conIva * (pct / 100));
      if (monto <= 0) continue;
      conIvaTotal += monto;
      const base = r2(monto / elegida.factor);
      basePorProducto[elegida.pid] = r2((basePorProducto[elegida.pid] ?? 0) + base);
      baseTotal += base;
      detalle.push({ product_id: elegida.pid, monto });
    }
    if (conIvaTotal <= 0) continue;

    for (const u of unidades) yaUsados.add(u.pid);
    discount += conIvaTotal;
    applied.push({
      promo, label: promo.name || promoLabel(promo), pares,
      discount: r2(conIvaTotal), discount_base: r2(baseTotal), detalle,
    });
  }

  return { discount: r2(discount), applied, basePorProducto };
}

/**
 * CUÁNTO CAMBIA SEGÚN A CUÁL SE LE DESCUENTE.
 *
 * Es lo que se le muestra al administrador cuando arma la promo: con los
 * precios de los productos que eligió, cuánto ahorra el cliente por par si el
 * descuento va al más barato y cuánto si va al más caro. Sin ese número,
 * elegir entre «barato» y «caro» es adivinar.
 */
export function compararReglasSegundaUnidad(
  precios: number[],
  pct = 50,
): { barato: number; caro: number; masCaro: number; masBarato: number; diferencia: number } | null {
  const p = precios.map(n => Number(n) || 0).filter(n => n > 0).sort((a, b) => b - a);
  if (p.length < 2) return null;
  const pares = Math.floor(p.length / 2);
  let barato = 0, caro = 0;
  for (let i = 0; i < pares; i++) {
    caro += p[i * 2] * (pct / 100);
    barato += p[i * 2 + 1] * (pct / 100);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    barato: r2(barato), caro: r2(caro),
    masCaro: p[0], masBarato: p[p.length - 1],
    diferencia: r2(caro - barato),
  };
}

/** Returns the first applicable promotion for a product (priority: products > category > all) */
export function getProductPromotion(
  productId: string,
  categoryId: string | null | undefined,
  promotions: Promotion[],
): Promotion | null {
  const today  = todayCR();
  const active = promotions.filter(
    /* Los combos y la segunda unidad se resuelven a nivel de CARRITO
       (computeCartCombos / computeSegundaUnidad), no por producto: dependen de
       qué más hay en la cuenta y de cómo se emparejan los precios. */
    p => p.type !== 'combo' && p.type !== 'second_half'
      && p.is_active && p.starts_at <= today && (!p.ends_at || p.ends_at >= today)
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
