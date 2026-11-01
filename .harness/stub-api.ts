const BASE: Record<string, any> = {};
(globalThis as any).__base = BASE;
const MENU = [
  { id: 'p1', name: 'Casado con pollo', unit_price: 4500, category_id: 'c1', station: 'Cocina', iva_rate: 13 },
  { id: 'p2', name: 'Lomito en salsa de hongos', unit_price: 7900, category_id: 'c1', station: 'Parrilla', iva_rate: 13 },
  { id: 'p3', name: 'Chifrijo', unit_price: 3800, category_id: 'c2', station: 'Cocina', iva_rate: 13 },
  { id: 'p4', name: 'Ceviche de corvina', unit_price: 4200, category_id: 'c2', station: 'Cocina', iva_rate: 13 },
  { id: 'p5', name: 'Cerveza nacional', unit_price: 1800, category_id: 'c3', station: 'Barra', iva_rate: 13 },
  { id: 'p6', name: 'Refresco natural', unit_price: 1200, category_id: 'c3', station: 'Barra', iva_rate: 13 },
  { id: 'p7', name: 'Tres leches', unit_price: 2400, category_id: 'c4', station: 'Barra', iva_rate: 13 },
  { id: 'p8', name: 'Flan de coco', unit_price: 2200, category_id: 'c4', station: 'Barra', iva_rate: 13 },
];
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  if (path.startsWith('/users/pin-login')) return { ticket_alias: 'Kendall' } as any;
  if (path.startsWith('/recipes/menu')) return MENU as any;
  if (path.startsWith('/mesa-digital/llamadas')) return [
    { id: 'l1', numero: 4, tipo: 'cuenta', personas: null, medio_pago: 'sinpe', estado: 'pendiente',
      created_at: new Date(Date.now() - 4 * 60000).toISOString(), atendida_at: null },
  ] as any;
  if (path.startsWith('/mesa-digital')) throw new Error('sin módulo');
  if (path.startsWith('/settings/tables-map')) { const { MESAS } = await import('./mesas'); return { items: MESAS } as any; }
  if (path.startsWith('/categories')) return [
    { id: 'c1', name: 'Platos fuertes' }, { id: 'c2', name: 'Entradas' },
    { id: 'c3', name: 'Bebidas' }, { id: 'c4', name: 'Postres' }] as any;
  if (path === '/table-orders/bills') return Object.values(BASE) as any;
  const m = path.match(/^\/table-orders\/bills\/(.+)$/);
  if (m && init?.method === 'PUT') { const b = JSON.parse(init.body); BASE[m[1]] = b; return b as any; }
  if (path.startsWith('/products')) return MENU as any;
  return [] as any;
}
export default apiFetch;
