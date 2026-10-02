import type { ReceiptData } from './posPrinterService';

/**
 * COPIA LOCAL DEL ÚLTIMO TIQUETE DE CADA VENTA.
 *
 * Reimprimir pedía la factura al servidor (`/invoices/:id`) para rearmar el
 * tiquete. Sin internet eso falla siempre, así que «Reimprimir» daba «No se pudo
 * reimprimir la factura» justo cuando más se necesita: se fue la red, la venta se
 * hizo igual, y el cliente está pidiendo su tiquete en el mostrador. Peor todavía
 * con las ventas hechas sin conexión, que ni existen en el servidor.
 *
 * El caché de facturas (`novapos_invoices_cache`) no alcanza: guarda número,
 * fecha, total y medio de pago, pero NO las líneas, y sin líneas no hay tiquete.
 *
 * Acá se guarda el tiquete COMPLETO tal como se imprimió —líneas, impuestos,
 * descuentos y datos del local—, al momento de imprimirlo. Reimprimir offline
 * saca exactamente el mismo papel, no una reconstrucción parecida.
 */

const KEY = (tenantId: string) => `novapos_tickets_${tenantId}`;
/** Tope de tiquetes guardados: alcanza para varios días de mostrador. */
const MAX = 60;

interface Guardado {
  /** Número de comprobante, normalizado (es la llave de búsqueda). */
  numero: string;
  /** Id de la factura en el servidor, cuando se conoce. */
  id?: string | null;
  guardadoEn: number;
  ticket: ReceiptData;
}

const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();

function leer(tenantId: string): Guardado[] {
  try {
    const raw = localStorage.getItem(KEY(tenantId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function escribir(tenantId: string, lista: Guardado[]): void {
  try {
    localStorage.setItem(KEY(tenantId), JSON.stringify(lista.slice(0, MAX)));
  } catch {
    /**
     * Si no cabe, se guardan solo los más recientes.
     *
     * Vale más tener los últimos diez tiquetes reimprimibles que fallar y no
     * tener ninguno. Si tampoco cabe, se deja así: reimprimir vuelve a pedirle
     * la factura al servidor, que es lo que hacía antes.
     */
    try { localStorage.setItem(KEY(tenantId), JSON.stringify(lista.slice(0, 10))); } catch { /* sin espacio */ }
  }
}

/** Guarda el tiquete que se acaba de imprimir. No lanza nunca. */
export function guardarTicket(tenantId: string, ticket: ReceiptData, invoiceId?: string | null): void {
  try {
    if (!tenantId) return;
    const numero = norm(ticket?.invoiceNumber);
    if (!numero) return;
    // Una reimpresión no se vuelve a guardar: su número trae «(Reimpresión)» y
    // pisaría el tiquete original con uno que ya dice que es copia.
    if (/REIMPRES/i.test(numero)) return;
    const lista = leer(tenantId).filter(g => g.numero !== numero);
    lista.unshift({ numero, id: invoiceId ?? null, guardadoEn: Date.now(), ticket });
    escribir(tenantId, lista);
  } catch { /* la reimpresión seguirá pidiéndole la factura al servidor */ }
}

/** El tiquete guardado de una venta, por número o por id. */
export function ticketGuardado(
  tenantId: string,
  busca: { invoiceNumber?: string | null; id?: string | null },
): ReceiptData | null {
  if (!tenantId) return null;
  const numero = norm(busca.invoiceNumber);
  const id = String(busca.id ?? '');
  const lista = leer(tenantId);
  const hit = lista.find(g => (numero && g.numero === numero) || (id && (g.id === id || g.numero === norm(id))));
  return hit?.ticket ?? null;
}

/** Cuántos tiquetes hay guardados (para avisos y diagnóstico). */
export function ticketsGuardados(tenantId: string): number {
  return leer(tenantId).length;
}
