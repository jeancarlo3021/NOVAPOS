/**
 * LAS VENTAS A CRÉDITO DE UN TURNO.
 *
 * Vive aparte de la pantalla del cierre porque es una regla con dos trampas, y
 * las dos daban un número que no se podía cuadrar contra nada:
 *
 * 1. El monto es la PARTE a crédito, no el total de la factura. Mostrando el
 *    total, el listado sumaba distinto del total del bloque y no había forma
 *    de saber cuál de los dos creer.
 * 2. Los clientes EXCLUIDOS del cierre (las compras de empleados a crédito)
 *    entran marcados. No van al arqueo —y está bien, esa plata no está en la
 *    gaveta— pero son deuda igual: no aparecer en ninguna parte del cierre
 *    los volvía invisibles.
 */
export interface CreditoDelTurno {
  /** Id de la FACTURA: con él se revisa si la cuenta por cobrar existe. */
  id: string;
  number: string;
  time: string;
  /** Lo que quedó a crédito en esta venta. */
  total: number;
  cliente: string;
  /** Cliente excluido del cierre (ej. empleados): no entra al arqueo. */
  excluido: boolean;
}

/**
 * Lo que quedó A CRÉDITO en una venta.
 *
 * Con pago mixto se suman solo las partes a crédito. Hoy el POS no deja
 * mezclar crédito con otro medio, pero una venta vieja, una importada o un
 * cambio de esa regla mañana haría que el cierre mintiera justo en el número
 * que alguien tiene que salir a cobrar.
 */
export function parteCredito(inv: any): number {
  const pays = Array.isArray(inv?.payments) ? inv.payments : null;
  if (pays && pays.length) {
    return pays
      .filter((p: any) => String(p?.method ?? '') === 'credit')
      .reduce((t: number, p: any) => t + Number(p?.amount || 0), 0);
  }
  return String(inv?.payment_method ?? '') === 'credit' ? Number(inv?.total || 0) : 0;
}

/**
 * @param invoices  Ventas que SÍ entran al arqueo del turno.
 * @param excluidas Ventas de clientes excluidos del cierre.
 */
export function creditosDelTurno(invoices: any[], excluidas: any[] = []): {
  creditos: CreditoDelTurno[];
  /** Suma de todo lo dado a crédito en el turno. */
  total: number;
  /** De esa suma, cuánto es de clientes excluidos del cierre. */
  excluido: number;
} {
  const creditos: CreditoDelTurno[] = [];
  let excluido = 0;
  for (const inv of [...(invoices ?? []), ...(excluidas ?? [])]) {
    const monto = parteCredito(inv);
    if (monto <= 0) continue;
    const esExcluido = !!inv?.exclude_from_close;
    if (esExcluido) excluido += monto;
    creditos.push({
      id: String(inv?.id ?? ''),
      number: String(inv?.invoice_number ?? inv?.id ?? ''),
      time: String(inv?.issued_at ?? inv?.created_at ?? ''),
      total: monto,
      cliente: String(inv?.customer_name ?? ''),
      excluido: esExcluido,
    });
  }
  creditos.sort((a, b) => a.time.localeCompare(b.time));
  return {
    creditos,
    total: creditos.reduce((t, v) => t + v.total, 0),
    excluido,
  };
}
