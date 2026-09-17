import { posPrinterService } from '@/services/pos/posPrinterService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { etiquetaMedioPago } from '@/utils/mediosDePago';
import type { Reservation } from '@/services/reservations/reservationsService';

const money = (n: number) => `${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const fecha = (d?: string | null) => {
  if (!d) return '—';
  const x = new Date(String(d).includes('T') ? String(d) : `${d}T00:00:00`);
  return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('es-CR');
};

/**
 * Comprobante de APARTADO para el cliente.
 *
 * No es una factura: la mercadería todavía no se entregó y la venta se factura
 * al retirarla. Lo que el cliente necesita llevarse es la constancia de lo que
 * apartó, cuánto abonó, cuánto debe y hasta cuándo se le guarda. Sale por la
 * impresora configurada (térmica, Bluetooth, QZ o navegador), igual que los
 * recibos de Cuentas por Cobrar.
 */
export type LineaDoc = { t: 'title' | 'center' | 'row' | 'text' | 'sep'; a?: string; b?: string };

/** Contenido del comprobante (separado de la impresión, para poder probarlo). */
export function lineasDelApartado(r: Reservation, negocio: string, copia?: string): LineaDoc[] {
  const saldo = Math.max(0, Number(r.total ?? 0) - Number(r.paid ?? 0));
  const ahora = new Date();
  const lineas: LineaDoc[] = [];

  if (negocio) lineas.push({ t: 'title', a: negocio });
  lineas.push({ t: 'title', a: 'COMPROBANTE DE APARTADO' });
  if (copia) lineas.push({ t: 'center', a: `** ${copia} **` });
  lineas.push({ t: 'center', a: `N° ${r.number ?? r.id.slice(0, 8)}` });
  lineas.push({ t: 'center', a: `${ahora.toLocaleDateString('es-CR')} ${ahora.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}` });
  lineas.push({ t: 'sep' });

  if (r.customer_name) lineas.push({ t: 'row', a: 'Cliente:', b: r.customer_name });
  if (r.customer_phone) lineas.push({ t: 'row', a: 'Teléfono:', b: r.customer_phone });
  lineas.push({ t: 'row', a: 'Apartado el:', b: fecha(r.created_at) });
  lineas.push({ t: 'row', a: 'Se guarda hasta:', b: fecha(r.expires_on) });
  lineas.push({ t: 'sep' });

  for (const it of r.reservation_items ?? []) {
    lineas.push({ t: 'row', a: `${it.quantity}x ${it.product_name}`, b: money(it.subtotal) });
  }
  lineas.push({ t: 'sep' });
  lineas.push({ t: 'row', a: 'TOTAL:', b: money(r.total) });
  lineas.push({ t: 'row', a: 'Abonado:', b: money(r.paid) });
  lineas.push({ t: 'row', a: 'SALDO:', b: money(saldo) });

  // Los abonos se detallan: es la prueba de cada pago que el cliente ya hizo.
  const abonos = r.payments ?? [];
  if (abonos.length > 0) {
    lineas.push({ t: 'sep' });
    lineas.push({ t: 'center', a: 'ABONOS' });
    for (const p of abonos) {
      lineas.push({
        t: 'row',
        a: `${fecha(p.created_at)} ${etiquetaMedioPago(p.method)}`,
        b: money(p.amount),
      });
    }
  }

  if (r.notes?.trim()) {
    lineas.push({ t: 'sep' });
    lineas.push({ t: 'text', a: `Nota: ${r.notes.trim()}` });
  }

  lineas.push({ t: 'sep' });
  lineas.push({ t: 'center', a: 'Este comprobante NO es una factura.' });
  lineas.push({ t: 'center', a: 'La factura se emite al retirar la mercadería.' });
  if (saldo > 0) lineas.push({ t: 'center', a: `Presente este comprobante para pagar el saldo de ${money(saldo)}.` });

  return lineas;
}

export async function imprimirApartado(r: Reservation, tenantId: string, copia?: string): Promise<void> {
  const general: any = cacheGet<any>(cacheKey(tenantId, 'settings_general'))
    ?? cacheGet<any>(cacheKey(tenantId, 'general_settings'));
  const negocio = String(general?.config?.businessName ?? general?.businessName ?? '').trim();
  await posPrinterService.printDoc(lineasDelApartado(r, negocio, copia), tenantId);
}
