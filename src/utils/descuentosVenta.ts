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
