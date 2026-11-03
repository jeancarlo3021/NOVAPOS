import { apiFetch } from '@/lib/api';

/** TALLER 3D — ventas y gastos del día, y la cola de impresión. */

export type MedioPago = 'efectivo' | 'sinpe' | 'tarjeta' | 'transferencia' | 'otro';
export type CatVenta = 'impresion' | 'diseno' | 'material' | 'reparacion' | 'otro';
export type CatGasto = 'filamento' | 'resina' | 'electricidad' | 'repuestos' | 'envio' | 'otro';
export type EstadoImpresion = 'en_cola' | 'programado' | 'imprimiendo' | 'listo' | 'entregado' | 'cancelado';

export interface Venta {
  id: string; fecha: string; descripcion: string; cliente: string | null;
  cantidad: number; precio_unitario: number; total: number;
  medio_pago: MedioPago; categoria: CatVenta; notas: string | null; created_at: string;
  /** De qué artículo del catálogo salió, y con cuál de sus precios. */
  producto_id: string | null; variante: string | null;
  /** El envío se cobra aparte de la pieza. */
  envio: number; envio_etiqueta: string | null;
}

/** Un precio del MISMO artículo: «Chico ₡2.000», «Grande ₡3.500». */
export interface Variante { nombre: string; precio: number }

export interface Articulo {
  id: string; nombre: string; descripcion: string | null; categoria: CatVenta;
  precio: number; variantes: Variante[];
  horas: number | null; material: string | null; color: string | null;
  activo: boolean;
}

export interface Tarifa { id: string; nombre: string; monto: number; activo: boolean }

export interface Gasto {
  id: string; fecha: string; descripcion: string; categoria: CatGasto;
  monto: number; medio_pago: MedioPago; proveedor: string | null; notas: string | null; created_at: string;
}

export interface Corte { clave: string; monto: number; cuantos: number }

export interface Resumen {
  desde: string; hasta: string;
  ventas: {
    total: number; cuantas: number;
    /** Lo cobrado por las piezas, sin el envío. */
    piezas: number; envios: number; cuantos_envios: number;
    por_medio: Corte[]; por_categoria: Corte[]; por_producto: Corte[];
  };
  gastos: { total: number; cuantos: number; por_categoria: Corte[]; por_medio: Corte[] };
  queda: number;
}

export interface Impresora { id: string; nombre: string; notas: string | null; activa: boolean }

export interface Impresion {
  id: string; pieza: string; cliente: string | null; cantidad: number; horas: number;
  /** Si salió del catálogo, de cuál artículo. */
  producto_id?: string | null;
  material: string | null; color: string | null; prioridad: number;
  estado: EstadoImpresion; impresora_id: string | null; impresora?: string | null;
  inicio: string | null; fin: string | null;
  entrega_estimada: string | null; fecha_limite: string | null;
  tarde?: boolean; notas: string | null; created_at: string;
}

export interface Calendario {
  desde: string; hasta: string;
  dias: Array<{ fecha: string; items: Impresion[] }>;
  sin_programar: Impresion[];
  impresoras: Impresora[];
}

export interface ConfigTaller {
  margen_horas: number;
  hora_corte_entrega: string;
  dias_entrega: number[];
}

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const taller3d = {
  // ── Ventas ──
  ventas: (fecha?: string, hasta?: string) => apiFetch<Venta[]>(`/taller-3d/ventas${qs({ fecha, hasta })}`),
  nuevaVenta: (v: Partial<Venta>) =>
    apiFetch<Venta>('/taller-3d/ventas', { method: 'POST', body: JSON.stringify(v) }),
  cambiarVenta: (id: string, v: Partial<Venta>) =>
    apiFetch<Venta>(`/taller-3d/ventas/${id}`, { method: 'PUT', body: JSON.stringify(v) }),
  borrarVenta: (id: string) => apiFetch(`/taller-3d/ventas/${id}`, { method: 'DELETE' }),

  // ── Gastos ──
  gastos: (fecha?: string, hasta?: string) => apiFetch<Gasto[]>(`/taller-3d/gastos${qs({ fecha, hasta })}`),
  nuevoGasto: (g: Partial<Gasto>) =>
    apiFetch<Gasto>('/taller-3d/gastos', { method: 'POST', body: JSON.stringify(g) }),
  cambiarGasto: (id: string, g: Partial<Gasto>) =>
    apiFetch<Gasto>(`/taller-3d/gastos/${id}`, { method: 'PUT', body: JSON.stringify(g) }),
  borrarGasto: (id: string) => apiFetch(`/taller-3d/gastos/${id}`, { method: 'DELETE' }),

  resumen: (fecha?: string, hasta?: string) => apiFetch<Resumen>(`/taller-3d/resumen${qs({ fecha, hasta })}`),

  // ── Catálogo ──
  catalogo: (todos = false) => apiFetch<Articulo[]>(`/taller-3d/catalogo${todos ? '?todos=1' : ''}`),
  nuevoArticulo: (a: Partial<Articulo>) =>
    apiFetch<Articulo>('/taller-3d/catalogo', { method: 'POST', body: JSON.stringify(a) }),
  cambiarArticulo: (id: string, a: Partial<Articulo>) =>
    apiFetch<Articulo>(`/taller-3d/catalogo/${id}`, { method: 'PUT', body: JSON.stringify(a) }),
  borrarArticulo: (id: string) => apiFetch(`/taller-3d/catalogo/${id}`, { method: 'DELETE' }),

  // ── Tarifas de envío ──
  tarifas: () => apiFetch<Tarifa[]>('/taller-3d/tarifas'),
  nuevaTarifa: (nombre: string, monto: number) =>
    apiFetch<Tarifa>('/taller-3d/tarifas', { method: 'POST', body: JSON.stringify({ nombre, monto }) }),
  cambiarTarifa: (id: string, t: Partial<Tarifa>) =>
    apiFetch<Tarifa>(`/taller-3d/tarifas/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  borrarTarifa: (id: string) => apiFetch(`/taller-3d/tarifas/${id}`, { method: 'DELETE' }),

  // ── Impresoras ──
  impresoras: () => apiFetch<Impresora[]>('/taller-3d/impresoras'),
  nuevaImpresora: (nombre: string, notas?: string) =>
    apiFetch<Impresora>('/taller-3d/impresoras', { method: 'POST', body: JSON.stringify({ nombre, notas }) }),
  cambiarImpresora: (id: string, p: Partial<Impresora>) =>
    apiFetch<Impresora>(`/taller-3d/impresoras/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  borrarImpresora: (id: string) => apiFetch(`/taller-3d/impresoras/${id}`, { method: 'DELETE' }),

  // ── Impresiones ──
  impresiones: (estado?: string) => apiFetch<Impresion[]>(`/taller-3d/impresiones${qs({ estado })}`),
  /** Devuelve la pieza y, de una, en qué máquina y para cuándo quedó. */
  nuevaImpresion: (t: Partial<Impresion>) =>
    apiFetch<Impresion & { plan: { impresora_id: string; inicio: string; fin: string; entrega_estimada: string; tarde: boolean } | null }>(
      '/taller-3d/impresiones', { method: 'POST', body: JSON.stringify(t) }),
  cambiarImpresion: (id: string, t: Partial<Impresion>) =>
    apiFetch<Impresion>(`/taller-3d/impresiones/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  estadoImpresion: (id: string, estado: EstadoImpresion) =>
    apiFetch<Impresion>(`/taller-3d/impresiones/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) }),
  borrarImpresion: (id: string) => apiFetch(`/taller-3d/impresiones/${id}`, { method: 'DELETE' }),

  planificar: () => apiFetch<{ programados: number; tarde: number }>('/taller-3d/planificar', { method: 'POST' }),
  calendario: (desde?: string, hasta?: string) => apiFetch<Calendario>(`/taller-3d/calendario${qs({ desde, hasta })}`),

  config: () => apiFetch<ConfigTaller>('/taller-3d/config'),
  guardarConfig: (c: Partial<ConfigTaller>) =>
    apiFetch<ConfigTaller>('/taller-3d/config', { method: 'PUT', body: JSON.stringify(c) }),
};

export default taller3d;
