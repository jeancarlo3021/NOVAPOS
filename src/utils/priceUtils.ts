// Shared price/margin utilities — used by ProductCard and ProductForm
// so both always show the exact same value.

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
