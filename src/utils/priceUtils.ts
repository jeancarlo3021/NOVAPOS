// Shared price/margin utilities — used by ProductCard and ProductForm
// so both always show the exact same value.

/**
 * Total en caja de una base: redondea la base y el IVA a colones enteros, igual
 * que el POS (subtotal = round(base), IVA = round(base·rate)).
 */
export const checkoutTotal = (base: number, rate: number) =>
  Math.round(base) + Math.round((base * rate) / 100);

/** Redondea a 2 decimales. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Precio "cerrado": dado un total CON IVA deseado, calcula la BASE con DECIMALES
 * (target ÷ (1+IVA)) para que el total de caja sea EXACTAMENTE el ingresado. La
 * base se guarda con decimales (precisión fiscal); el POS la muestra redondeada.
 */
export function closedPriceBase(target: number, rate: number): { base: number; iva: number; total: number } {
  const base = r2(target / (1 + rate / 100));
  const total = checkoutTotal(base, rate);
  return { base, iva: total - Math.round(base), total };
}

/**
 * Tarifa de IVA que le toca a un producto, en porcentaje.
 *
 * No hay un IVA único: manda el `iva_rate` del producto (puede ser 0 en los
 * exentos) y solo si no está definido se usa el global de Ajustes. Ojo con el
 * `0`: es una tarifa VÁLIDA, no un "sin configurar", así que no sirve `||`.
 */
export function productIvaPct(product: any, globalPct: number): number {
  const raw = product?.iva_rate;
  return raw != null && raw !== '' ? Number(raw) : globalPct;
}

/**
 * Precio con IVA incluido, para MOSTRAR.
 *
 * El sistema guarda los precios sin impuesto y lo suma al cobrar. Eso está bien
 * para la contabilidad, pero al cliente hay que enseñarle lo que va a pagar —en
 * Costa Rica el precio exhibido debe incluir los impuestos—, y al cajero también:
 * cantar un precio y que la pantalla muestre otro al cobrar genera discusiones
 * en la fila.
 *
 * Es SOLO presentación: no cambia lo que se guarda ni lo que se le cobra. El
 * redondeo a 2 decimales es el mismo que usa el carrito para el IVA de cada
 * línea, así que la suma de las líneas mostradas cuadra con el total.
 */
export function displayPrice(
  base: number,
  ivaPct: number,
  opts: { taxEnabled: boolean; withTax: boolean },
): number {
  const b = Number(base) || 0;
  if (!opts.withTax || !opts.taxEnabled) return b;
  return r2(b + b * ((Number(ivaPct) || 0) / 100));
}

export interface MarginResult {
  value: number | null;   // percentage, null = cannot compute
  label: string;          // formatted string e.g. "45.3%"
  profit: number | null;  // absolute gain per unit
  color: 'gray' | 'red' | 'amber' | 'green';
}

/**
 * Markup sobre costo: (precio - costo) / costo × 100
 * Returns null when cost is 0 or either price is missing.
 */
export function calcMargin(unitPrice: number | string | null | undefined,
                           costPrice: number | string | null | undefined): MarginResult {
  const price = parseFloat(String(unitPrice ?? 0)) || 0;
  const cost  = parseFloat(String(costPrice  ?? 0)) || 0;

  if (price <= 0 || cost <= 0) {
    return { value: null, label: '—', profit: null, color: 'gray' };
  }

  const value  = ((price - cost) / cost) * 100;
  const profit = price - cost;
  const label  = `${value.toFixed(1)}%`;
  const color  = value < 0 ? 'red' : value < 20 ? 'amber' : 'green';

  return { value, label, profit, color };
}

export const MARGIN_TEXT: Record<MarginResult['color'], string> = {
  gray:  'text-gray-400',
  red:   'text-red-600',
  amber: 'text-amber-600',
  green: 'text-emerald-600',
};

export const MARGIN_BG: Record<MarginResult['color'], string> = {
  gray:  'from-gray-50',
  red:   'from-red-50',
  amber: 'from-amber-50',
  green: 'from-emerald-50',
};
