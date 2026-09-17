/**
 * Descuentos de una venta: por línea y general.
 *
 * Es la MISMA fórmula que usa el servidor para las proformas (computeTotals):
 * primero el descuento de cada línea (porcentaje o monto, nunca más que la
 * línea), después el general sobre lo que quedó (porcentaje o monto), repartido
 * en proporción para que cada tarifa de IVA reciba su parte. Así una proforma
 * pasada al POS electrónico da exactamente el mismo total.
 *
 * El resultado por línea es el NETO que va al comprobante: Hacienda recibe el
 * precio efectivo (neto ÷ cantidad), igual que en el POS normal.
 */
export interface LineaConDescuento {
  quantity: number;
  unit_price: number;
  iva_rate: number;
  discount_percent?: number;
  discount_amount?: number;
}

export interface DescuentoGeneral {
  tipo: 'pct' | 'monto';
  valor: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcularVenta(lineas: LineaConDescuento[], general: DescuentoGeneral) {
  const brutos = lineas.map(l => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0));
  const trasLinea = lineas.map((l, i) => {
    const pct = Math.min(100, Math.max(0, Number(l.discount_percent) || 0));
    const monto = Math.max(0, Number(l.discount_amount) || 0);
    return brutos[i] - Math.min(brutos[i], pct > 0 ? brutos[i] * (pct / 100) : monto);
  });
  const netoLineas = trasLinea.reduce((s, n) => s + n, 0);
  const valor = Math.max(0, Number(general.valor) || 0);
  const descGeneral = Math.min(netoLineas,
    general.tipo === 'pct' ? netoLineas * (Math.min(100, valor) / 100) : valor);
  const factor = netoLineas > 0 ? (netoLineas - descGeneral) / netoLineas : 1;

  const netos = trasLinea.map(n => r2(n * factor));
  const bruto = r2(brutos.reduce((s, n) => s + n, 0));
  const subtotal = r2(netos.reduce((s, n) => s + n, 0));
  const iva = r2(netos.reduce((s, n, i) => s + n * ((Number(lineas[i].iva_rate) || 0) / 100), 0));
  return {
    /** Neto (sin IVA) de cada línea, en el mismo orden. */
    netos,
    /** Rebajo de cada línea: el suyo más su parte del general. */
    descuentos: netos.map((n, i) => r2(brutos[i] - n)),
    bruto,
    descuento: r2(bruto - subtotal),
    /** Neto después de los descuentos de línea y antes del general. */
    netoLineas: r2(netoLineas),
    /** Lo que rebajó el descuento general. */
    descuentoGeneral: r2(descGeneral),
    subtotal,
    iva,
    total: r2(subtotal + iva),
  };
}

/**
 * Descuentos de una PROFORMA llevados al carrito.
 *
 * Ojo con lo guardado: `discount_percent` de la proforma es el descuento general
 * del documento, pero `discount_amount` es el descuento TOTAL —ya incluye el de
 * cada línea—. Usarlo como general lo aplica dos veces y termina rebajando
 * TODAS las líneas, aunque el descuento fuera de un solo producto.
 *
 * Devuelve el neto de cada línea (con su descuento y su parte del general) y el
 * descuento efectivo de cada una, para mostrarlo en el carrito. Si la cuenta no
 * da el total cotizado —una proforma vieja con el general en plata, que no quedó
 * guardado como tal— se ajusta en proporción: al cliente se le cobra lo que dice
 * su cotización.
 */
export function netosDeProforma(
  items: Array<{ quantity: number; unit_price: number; discount_percent?: number | null; discount_amount?: number | null }>,
  generalPct: number | null | undefined,
  baseCotizada?: number | null,
) {
  const pct = (n: any) => Math.min(100, Math.max(0, Number(n) || 0));
  const monto = (n: any) => Math.max(0, Number(n) || 0);

  const brutos = items.map(it => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
  const trasLinea = items.map((it, i) => {
    const p = pct(it.discount_percent);
    const a = monto(it.discount_amount);
    return brutos[i] - Math.min(brutos[i], p > 0 ? brutos[i] * (p / 100) : a);
  });

  const netoLineas = trasLinea.reduce((t, n) => t + n, 0);
  const g = pct(generalPct);
  let factor = netoLineas > 0 ? (netoLineas - netoLineas * (g / 100)) / netoLineas : 1;

  const base = Number(baseCotizada ?? 0);
  const calculada = netoLineas * factor;
  if (base > 0 && calculada > 0 && Math.abs(calculada - base) > 0.5) factor = factor * (base / calculada);

  const netos = trasLinea.map(n => r2(n * factor));
  return {
    netos,
    brutos: brutos.map(r2),
    /** Descuento efectivo de cada línea, en %, para mostrarlo en el carrito. */
    porcentajes: netos.map((n, i) => (brutos[i] > 0 ? Math.round((1 - n / brutos[i]) * 10000) / 100 : 0)),
    subtotal: r2(netos.reduce((t, n) => t + n, 0)),
  };
}
