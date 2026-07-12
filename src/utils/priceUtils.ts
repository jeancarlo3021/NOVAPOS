// Shared price/margin utilities — used by ProductCard and ProductForm
// so both always show the exact same value.

/** Total en caja de una base entera: base + IVA redondeado (igual que el POS). */
export const checkoutTotal = (base: number, rate: number) => base + Math.round((base * rate) / 100);

/**
 * Precio "cerrado": dado un total CON IVA deseado, encuentra la BASE ENTERA cuyo
 * total de caja (base + IVA redondeado) sea múltiplo de ₡10 y lo más cercano al
 * total ingresado. Así no se necesita línea de redondeo y cuadra en FE.
 */
export function closedPriceBase(target: number, rate: number): { base: number; iva: number; total: number } {
  const base0 = Math.round(target / (1 + rate / 100));
  let best = base0, bestDiff = Infinity;
  for (let b = Math.max(1, base0 - 40); b <= base0 + 40; b++) {
    const t = checkoutTotal(b, rate);
    if (t % 10 !== 0) continue;             // el total debe terminar en 0
    const diff = Math.abs(t - target);
    if (diff <= bestDiff) { bestDiff = diff; best = b; }  // empate → total mayor
  }
  const total = checkoutTotal(best, rate);
  return { base: best, iva: total - best, total };
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
