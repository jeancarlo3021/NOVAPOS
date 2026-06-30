import { apiFetch } from '@/lib/api';

export interface Truck {
  id: string; name: string; code?: string; type: string; driver_id?: string | null;
}

export interface RouteStop {
  id: string; route_id: string; customer_id: string; seq: number;
  lat?: number | null; lng?: number | null;
  status: 'pending' | 'visited' | 'no_sale'; reason?: string | null;
  customer?: { id: string; name: string; phone?: string; address?: string; email?: string };
}

export interface DeliveryRoute {
  id: string; tenant_id: string; warehouse_id: string; driver_id?: string | null;
  modality: 'autoventa' | 'preventa' | 'ambas'; route_date: string; status: 'open' | 'closed';
  notes?: string | null; closed_at?: string | null;
  warehouse?: { id: string; name: string; code?: string };
  stops_total?: number; stops_done?: number; stops?: RouteStop[];
}

export interface RouteCloseSummary {
  route_id: string; sales_count: number; sales_total: number;
  voids_count: number; returned_items: number;
  returned?: Array<{ name: string; quantity: number }>;
  by_method?: { cash: number; card: number; sinpe: number; credit: number };
}

export const distributionService = {
  trucks: () => apiFetch<Truck[]>('/routes/trucks'),

  report: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return apiFetch<{
      routes: Array<{ id: string; route_date: string; status: string; modality: string; truck: string; driver: string; sales_count: number; sales_total: number; voids_count: number; cash: number; card: number; sinpe: number; credit: number }>;
      trucks: Array<{ truck: string; routes: number; sales_count: number; sales_total: number }>;
      by_method: { cash: number; card: number; sinpe: number; credit: number };
    }>(`/routes/report${qs ? '?' + qs : ''}`);
  },

  list: (params?: { date?: string; status?: string; driver_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.status) q.set('status', params.status);
    if (params?.driver_id) q.set('driver_id', params.driver_id);
    const qs = q.toString();
    return apiFetch<DeliveryRoute[]>(`/routes${qs ? '?' + qs : ''}`);
  },

  get: (id: string) => apiFetch<DeliveryRoute>(`/routes/${id}`),

  /** Rutas asignadas al repartidor actual. */
  mine: () => apiFetch<DeliveryRoute[]>('/routes/mine'),
  /** Pedidos (preventa) pendientes de todas las rutas del repartidor. */
  myOrders: () => apiFetch<any[]>('/routes/my-orders'),

  create: (body: {
    warehouse_id: string; driver_id?: string | null;
    modality: 'autoventa' | 'preventa' | 'ambas'; route_date?: string; notes?: string;
    stops?: Array<{ customer_id: string; seq?: number; lat?: number | null; lng?: number | null }>;
  }) => apiFetch<DeliveryRoute>('/routes', { method: 'POST', body: JSON.stringify(body) }),

  setStops: (id: string, stops: Array<{ customer_id: string; seq?: number; lat?: number | null; lng?: number | null }>) =>
    apiFetch(`/routes/${id}/stops`, { method: 'PUT', body: JSON.stringify({ stops }) }),

  updateStop: (stopId: string, patch: { status?: string; reason?: string; seq?: number }) =>
    apiFetch(`/routes/stops/${stopId}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  load: (id: string, items: Array<{ product_id: string; quantity: number }>) =>
    apiFetch(`/routes/${id}/load`, { method: 'POST', body: JSON.stringify({ items }) }),

  centralStock: () => apiFetch<Record<string, number>>('/routes/central-stock'),

  /** Borra la carga del camión (devuelve todo al inventario). Solo si no hay ventas. */
  clearLoad: (id: string) => apiFetch<{ returned_items: number }>(`/routes/${id}/clear-load`, { method: 'POST' }),

  truckStock: (id: string) =>
    apiFetch<Array<{ product_id: string; quantity: number; product?: { id: string; name: string; sku?: string; unit_price?: number } }>>(`/routes/${id}/truck-stock`),

  close: (id: string) => apiFetch<RouteCloseSummary>(`/routes/${id}/close`, { method: 'POST' }),

  /** Resumen de una ruta ya cerrada (para reimprimir el cierre). */
  closeSummary: (id: string) => apiFetch<RouteCloseSummary & { truck?: string; route_date?: string }>(`/routes/${id}/close-summary`),

  // ── Venta en ruta (autoventa) y pedido (preventa) ──
  sale: (id: string, body: any) =>
    apiFetch(`/routes/${id}/sale`, { method: 'POST', body: JSON.stringify(body) }),
  order: (id: string, body: any) =>
    apiFetch(`/routes/${id}/order`, { method: 'POST', body: JSON.stringify(body) }),
  orders: (id: string) =>
    apiFetch<any[]>(`/routes/${id}/orders`),
  deliverOrder: (orderId: string, body?: { payment_method?: string; issued_at?: string }) =>
    apiFetch<any>(`/routes/order/${orderId}/deliver`, { method: 'POST', body: JSON.stringify(body ?? {}) }),

  /** Ventas (facturas) de la ruta — para poder anularlas. */
  sales: (id: string) => apiFetch<any[]>(`/routes/${id}/sales`),
  /** Anula una factura de ruta y devuelve el stock al camión. */
  voidSale: (invoiceId: string) =>
    apiFetch<any>(`/routes/void-sale/${invoiceId}`, { method: 'POST' }),
};
