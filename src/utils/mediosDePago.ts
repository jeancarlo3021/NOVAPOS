/**
 * Nombre de cada medio de pago, tal como sale impreso en el ticket.
 *
 * Estaba repetido en tres pantallas, y en todas faltaban medios: el ticket de
 * una venta por plataforma salía con «third_party» y el de un pago mixto con
 * «mixed». Acá está la lista completa, con los códigos que Hacienda usa en el
 * comprobante electrónico.
 */
export const ETIQUETA_MEDIO_PAGO: Record<string, string> = {
  cash: 'Efectivo',              // Hacienda 01
  card: 'Tarjeta',               // 02
  check: 'Cheque',               // 03
  transfer: 'Transferencia',     // 04
  third_party: 'Recaudado por terceros',  // 05
  sinpe: 'SINPE Móvil',          // 06
  digital: 'Plataforma digital', // 07
  other: 'Otros',                // 99
  credit: 'Crédito',             // condición de venta, no medio de pago
  mixed: 'Pago mixto',
};

/** Nombre del medio de pago; si no se conoce, se devuelve tal cual llegó. */
export const etiquetaMedioPago = (id: string | null | undefined): string =>
  ETIQUETA_MEDIO_PAGO[String(id ?? '')] ?? String(id ?? '');
