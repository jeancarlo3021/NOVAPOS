/**
 * Capa offline para Distribución/Repartidor (fase 1: vender + entregar + imprimir).
 *
 * - Lecturas (ruta, pedidos, stock del camión) se cachean en localStorage cuando
 *   hay conexión y se leen del cache cuando no la hay.
 * - Escrituras (venta autoventa, entrega de pedido, pedido preventa) se mandan al
 *   backend si hay conexión; si no, se ENCOLAN (offlineQueue) y se devuelve un
 *   número de factura PROVISIONAL (OFF-xxxxxx). Al recuperar conexión, useOfflineSync
 *   reproduce la cola y el backend asigna el consecutivo real.
 */
import { offlineQueue } from '@/services/offlineQueue';
import { distributionService } from './distributionService';

const isNetworkErr = (e: unknown): boolean => {
  if (!navigator.onLine) return true;
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror') ||
         m.includes('load failed') || m.includes('network request failed') ||
         m.includes('err_internet') || m.includes('timeout');
};

const provisional = () => `OFF-${Date.now().toString().slice(-6)}`;

const routeKey  = (id: string) => `novapos_dist_route_${id}`;
const ordersKey = (id: string) => `novapos_dist_orders_${id}`;
const stockKey  = (id: string) => `novapos_dist_stock_${id}`;

function readCache<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; }
  catch { return fallback; }
}
function writeCache(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* cuota llena */ }
}

/** Descuenta del stock cacheado del camión los items vendidos (para reflejar offline). */
function adjustCachedStock(routeId: string, items: Array<{ product_id: string; quantity: number }>, sign: number) {
  const stock = readCache<any[]>(stockKey(routeId), []);
  if (stock.length === 0) return;
  const byId = new Map(stock.map(s => [s.product_id, s]));
  for (const it of items) {
    const row = byId.get(it.product_id);
    if (row) row.quantity = Number(row.quantity) + sign * Number(it.quantity);
  }
  writeCache(stockKey(routeId), stock);
}

export const distributionOfflineService = {
  isOnline: () => navigator.onLine,

  // ── Lecturas con cache ──────────────────────────────────────────────────
  async getRoute(routeId: string) {
    if (navigator.onLine) {
      try { const r = await distributionService.get(routeId); writeCache(routeKey(routeId), r); return r; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    return readCache<any>(routeKey(routeId), null);
  },

  async orders(routeId: string) {
    if (navigator.onLine) {
      try { const o = await distributionService.orders(routeId); writeCache(ordersKey(routeId), o ?? []); return o ?? []; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    return readCache<any[]>(ordersKey(routeId), []);
  },

  async mine() {
    if (navigator.onLine) {
      try { const r = await distributionService.mine(); writeCache('novapos_dist_mine', r ?? []); return r ?? []; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    return readCache<any[]>('novapos_dist_mine', []);
  },

  async myOrders() {
    if (navigator.onLine) {
      try { const o = await distributionService.myOrders(); writeCache('novapos_dist_myorders', o ?? []); return o ?? []; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    return readCache<any[]>('novapos_dist_myorders', []);
  },

  async truckStock(routeId: string) {
    if (navigator.onLine) {
      try { const s = await distributionService.truckStock(routeId); writeCache(stockKey(routeId), s ?? []); return s ?? []; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    return readCache<any[]>(stockKey(routeId), []);
  },

  // ── Escrituras (online directo / offline encolado) ──────────────────────
  async sale(routeId: string, body: any): Promise<{ invoice_number: string; offline?: boolean }> {
    if (navigator.onLine) {
      try { return await distributionService.sale(routeId, body) as any; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    await offlineQueue.enqueue(`/routes/${routeId}/sale`, 'POST', body);
    adjustCachedStock(routeId, body.items ?? [], -1);
    return { invoice_number: provisional(), offline: true };
  },

  async deliverOrder(routeId: string, orderId: string, body: any): Promise<{ invoice_number: string; offline?: boolean }> {
    if (navigator.onLine) {
      try { return await distributionService.deliverOrder(orderId, body) as any; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    await offlineQueue.enqueue(`/routes/order/${orderId}/deliver`, 'POST', body);
    // Marcar el pedido como entregado en el cache local para que desaparezca de "Por entregar".
    const orders = readCache<any[]>(ordersKey(routeId), []);
    const o = orders.find(x => x.id === orderId);
    if (o) { o.status = 'delivered'; writeCache(ordersKey(routeId), orders); }
    return { invoice_number: provisional(), offline: true };
  },

  async order(routeId: string, body: any): Promise<{ offline?: boolean }> {
    if (navigator.onLine) {
      try { await distributionService.order(routeId, body); return {}; }
      catch (e) { if (!isNetworkErr(e)) throw e; }
    }
    await offlineQueue.enqueue(`/routes/${routeId}/order`, 'POST', body);
    return { offline: true };
  },
};

export default distributionOfflineService;
