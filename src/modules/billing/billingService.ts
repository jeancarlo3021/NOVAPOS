import type { Bill, SpotRef } from './types';
import { nextBillColor } from './types';
import { apiFetch } from '@/lib/api';

/**
 * Cuentas del módulo Restaurante.
 *
 * ANTES vivían en el localStorage del navegador: no se compartían entre
 * dispositivos —el mesero con tablet y el cajero en la caja veían cosas
 * distintas— y se perdían al limpiar el caché. Ahora se guardan en la base
 * (`table_orders`), la misma tabla del mapa de mesas.
 *
 * El caché local se conserva como RESPALDO: si se cae la red, el restaurante
 * sigue trabajando con lo último que vio y sube en cuanto vuelve la conexión.
 */

const KEY = (tenantId: string) => `novapos_bills_${tenantId}`;

function uid() {
  // UUID real: es la clave primaria en la base.
  const rnd = globalThis.crypto?.randomUUID?.();
  if (rnd) return rnd;
  // Respaldo para contexto no seguro (http), donde randomUUID no existe.
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function readCache(tenantId: string): Bill[] {
  try {
    const raw = localStorage.getItem(KEY(tenantId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeCache(tenantId: string, bills: Bill[]) {
  try { localStorage.setItem(KEY(tenantId), JSON.stringify(bills)); } catch { /* cuota */ }
}

/** Cuentas que no se pudieron subir. Se reintentan en el siguiente guardado. */
const pending = new Set<string>();

export const billingService = {
  /** Lectura SINCRÓNICA del caché — para el primer render, sin esperar la red. */
  load(tenantId: string): Bill[] {
    return readCache(tenantId);
  },

  /** Lectura desde la BASE: es la fuente de verdad y lo que ve todo el mundo. */
  async fetch(tenantId: string): Promise<Bill[]> {
    const bills = await apiFetch<Bill[]>('/table-orders/bills');
    writeCache(tenantId, bills ?? []);
    return bills ?? [];
  },

  /**
   * Guarda las cuentas. Escribe el caché de inmediato (la UI no espera) y sube
   * cada cuenta a la base. Las que fallen quedan pendientes y se reintentan en el
   * próximo guardado, así una caída de red no pierde consumo.
   */
  async save(tenantId: string, bills: Bill[]): Promise<void> {
    writeCache(tenantId, bills);
    await Promise.all(bills.map(async (b) => {
      try {
        await apiFetch(`/table-orders/bills/${b.id}`, { method: 'PUT', body: JSON.stringify(b) });
        pending.delete(b.id);
      } catch (e) {
        pending.add(b.id);
        console.warn('[billing] no se pudo subir la cuenta', b.id, e);
      }
    }));
  },

  /**
   * Guarda UNA cuenta y DICE si llegó al servidor.
   *
   * `save` se traga los errores a propósito: es el guardado automático de
   * fondo y no tiene a quién avisarle. Pero cuando el mesero toca «Guardar»
   * sí hay a quién avisarle, y callarse que la cuenta se quedó en la tablet
   * es lo que hace que un consumo se pierda sin que nadie se entere.
   *
   * No lanza: el caché local se escribe igual y la cuenta sigue en pantalla.
   * El restaurante tiene que poder trabajar sin internet.
   */
  async guardar(tenantId: string, bill: Bill): Promise<boolean> {
    const todas = readCache(tenantId);
    const i = todas.findIndex(b => b.id === bill.id);
    if (i >= 0) todas[i] = bill; else todas.push(bill);
    writeCache(tenantId, todas);
    try {
      await apiFetch(`/table-orders/bills/${bill.id}`, { method: 'PUT', body: JSON.stringify(bill) });
      pending.delete(bill.id);
      return true;
    } catch (e) {
      pending.add(bill.id);
      console.warn('[billing] no se pudo subir la cuenta', bill.id, e);
      return false;
    }
  },

  /** Borra la cuenta en la base. */
  async remove(id: string): Promise<void> {
    try { await apiFetch(`/table-orders/bills/${id}`, { method: 'DELETE' }); }
    catch (e) { console.warn('[billing] no se pudo borrar la cuenta', id, e); }
  },

  /** ¿Quedó algo sin subir? Para avisarlo en la pantalla. */
  pendingCount(): number { return pending.size; },

  // Crear una cuenta nueva asociada a uno o más spots.
  create(initialSpot: SpotRef, allBills: Bill[]): Bill {
    const usedColors = allBills.filter(b => b.status === 'open').map(b => b.color);
    return {
      id: uid(),
      spots: [initialSpot],
      items: [],
      opened_at: new Date().toISOString(),
      status: 'open',
      color: nextBillColor(usedColors),
    };
  },
};

// Devuelve el bill abierto que contiene el spot dado, o null.
export function findOpenBillForSpot(spotId: string, bills: Bill[]): Bill | null {
  return bills.find(b => b.status === 'open' && b.spots.some(s => s.id === spotId)) ?? null;
}
