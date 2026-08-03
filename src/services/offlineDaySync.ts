/**
 * Sincronización de una JORNADA COMPLETA offline.
 *
 * El POS puede pasar todo el día sin internet: se abre caja, se vende y se cierra,
 * todo en la cola local. Cuando vuelve la conexión hay que subirlo EN ORDEN, porque
 * las operaciones dependen entre sí:
 *
 *   1. APERTURAS  — crean la sesión en el servidor y devuelven su id real.
 *   2. FACTURAS   — necesitan ese id (se remapea el id offline → el del servidor).
 *   3. ANULACIONES— sobre facturas que ya tienen que existir arriba.
 *   4. CIERRES    — al final: si el cierre sube antes que las ventas, la caja queda
 *                   cerrada en el servidor SIN los movimientos del día y los totales
 *                   no cuadran.
 *   5. El resto (compras, cola genérica), que no dependen del orden.
 *
 * Además no se confía en `navigator.onLine`: marca "en línea" con solo estar pegado
 * al WiFi aunque no haya internet, y en ese caso el evento `online` nunca vuelve a
 * dispararse. Por eso se sondea el backend de verdad cada cierto tiempo.
 */

import { backendReachable } from './connectivity/connectivityService';
import { cashSessionOfflineService } from './cashManagement/cashSessionOfflineService';
import { cashSessionService } from './cashManagement/cashSessionsService';
import { posOfflineService } from './pos/posOfflineService';
import { invoicesService } from './invoice/invoiceService';
import { purchasesOfflineService } from './Inventory/purchasesOfflineService';
import { offlineSyncService } from './offlineSyncService';
import { offlineQueue } from './offlineQueue';
import { apiFetch } from '@/lib/api';

export interface DaySyncResult {
  ok: boolean;
  opens: number;
  invoices: number;
  voids: number;
  closes: number;
  others: number;
  errors: string[];
  /** true si quedó algo sin subir (se reintenta en el próximo ciclo). */
  pending: boolean;
}

/** Cantidad total de operaciones esperando subir. */
export async function pendingDayCount(tenantId?: string | null): Promise<number> {
  const [cash, invoices, voids, purchases, generic] = await Promise.all([
    cashSessionOfflineService.getPendingCount().catch(() => 0),
    posOfflineService.getPendingCount().catch(() => 0),
    posOfflineService.getPendingVoidCount().catch(() => 0),
    tenantId ? purchasesOfflineService.getPendingCount(tenantId).catch(() => 0) : Promise.resolve(0),
    offlineSyncService.getSyncStatus().then(s => s.pending).catch(() => 0),
  ]);
  return cash + invoices + voids + purchases + generic;
}

let running = false;

/**
 * Sube TODO lo pendiente, en el orden correcto. Es idempotente y seguro de llamar
 * repetido: cada cola marca lo ya subido y no lo repite.
 */
export async function syncOfflineDay(
  tenantId: string | null | undefined,
  opts: {
    /** Sube las facturas pendientes. Se delega al POS, que ya sabe reconstruir el
     *  payload completo y re-emitir la FE. Devuelve cuántas subió. */
    syncInvoices?: () => Promise<number | void>;
  } = {},
): Promise<DaySyncResult> {
  const res: DaySyncResult = {
    ok: false, opens: 0, invoices: 0, voids: 0, closes: 0, others: 0,
    errors: [], pending: true,
  };
  if (running) { res.errors.push('Ya hay una sincronización en curso'); return res; }

  // Sondeo REAL del backend (no `navigator.onLine`).
  if (!(await backendReachable(true))) {
    res.errors.push('Sin conexión con el servidor');
    return res;
  }

  running = true;
  try {
    // ── 1) APERTURAS ────────────────────────────────────────────────────────
    // Se suben solas primero para conocer el id real de la sesión antes de las
    // facturas. Los CIERRES se dejan para el final (paso 4).
    const sessionIdMap: Record<string, string> = {};
    const opsBefore = await cashSessionOfflineService.getPendingOperations();
    const opens = opsBefore.filter((o: any) => !o.synced && o.type === 'open');
    for (const op of opens) {
      try {
        const created = await cashSessionService.createCashSession(op.data);
        if (op.id && created?.id && op.id !== created.id) {
          sessionIdMap[op.id] = created.id;
          // Las facturas guardadas apuntan al id offline: se reapuntan al real.
          await posOfflineService.remapSessionId(op.id, created.id);
          await posOfflineService.updateInvoiceSessionIds(op.id, created.id);
        }
        await cashSessionOfflineService.markSynced(op.id);
        res.opens++;
      } catch (e: any) {
        res.errors.push(`Apertura de caja: ${e?.message ?? 'error'}`);
      }
    }

    // ── 2) FACTURAS ─────────────────────────────────────────────────────────
    if (opts.syncInvoices) {
      const before = await posOfflineService.getPendingCount().catch(() => 0);
      try {
        const n = await opts.syncInvoices();
        const after = await posOfflineService.getPendingCount().catch(() => 0);
        res.invoices = typeof n === 'number' ? n : Math.max(0, before - after);
      } catch (e: any) {
        res.errors.push(`Facturas: ${e?.message ?? 'error'}`);
      }
    }

    // ── 3) ANULACIONES ──────────────────────────────────────────────────────
    try {
      const r = await posOfflineService.syncPendingVoids(async (invoiceId: string) => { await invoicesService.cancelInvoice(invoiceId); });
      res.voids = (r as any)?.synced ?? 0;
      for (const d of ((r as any)?.details ?? [])) {
        if (d?.error) res.errors.push(`Anulación: ${d.error}`);
      }
    } catch (e: any) {
      res.errors.push(`Anulaciones: ${e?.message ?? 'error'}`);
    }

    // ── 4) CIERRES ──────────────────────────────────────────────────────────
    // AL FINAL, y solo si no quedaron facturas pendientes: cerrar una caja a la
    // que todavía le faltan ventas dejaría los totales mal en el servidor.
    const stillPendingInvoices = await posOfflineService.getPendingCount().catch(() => 0);
    const opsNow = await cashSessionOfflineService.getPendingOperations();
    const closes = opsNow.filter((o: any) => !o.synced && o.type === 'close');
    if (closes.length > 0 && stillPendingInvoices > 0) {
      res.errors.push(
        `Quedan ${stillPendingInvoices} venta(s) sin subir: el cierre de caja se pospone para que los totales cuadren.`,
      );
    } else {
      for (const op of closes) {
        try {
          const data = { ...op.data, id: sessionIdMap[op.data.id] ?? op.data.id };
          await cashSessionService.closeCashSession(data);
          await cashSessionOfflineService.markSynced(op.id);
          res.closes++;
        } catch (e: any) {
          res.errors.push(`Cierre de caja: ${e?.message ?? 'error'}`);
        }
      }
    }

    // ── 5) El resto (sin dependencias de orden) ─────────────────────────────
    const [generic, purchases, queue] = await Promise.all([
      offlineSyncService.syncOperations().catch((e: any) => ({ synced: 0, errors: [e?.message ?? 'error'] })),
      tenantId
        ? purchasesOfflineService.syncAll(tenantId).catch((e: any) => ({ synced: 0, errors: [e?.message ?? 'error'] }))
        : Promise.resolve({ synced: 0, errors: [] as any[] }),
      offlineQueue.syncAll(apiFetch).catch((e: any) => ({ synced: 0, errors: [e?.message ?? 'error'] })),
    ]);
    res.others = (generic as any).synced + (purchases as any).synced + (queue as any).synced;
    for (const e of [...((generic as any).errors ?? []), ...((purchases as any).errors ?? []), ...((queue as any).errors ?? [])]) {
      res.errors.push(typeof e === 'string' ? e : (e?.error ?? JSON.stringify(e)));
    }

    // Solo se limpia la cola de caja cuando ya NO queda nada pendiente.
    const left = await pendingDayCount(tenantId);
    res.pending = left > 0;
    if (!res.pending) {
      try { await cashSessionOfflineService.clearSynced(); } catch { /* no crítico */ }
    }
    res.ok = res.errors.length === 0;
    return res;
  } finally {
    running = false;
  }
}
