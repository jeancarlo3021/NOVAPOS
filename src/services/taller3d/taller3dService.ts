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
}

export interface Gasto {
  id: string; fecha: string; descripcion: string; categoria: CatGasto;
  monto: number; medio_pago: MedioPago; proveedor: string | null; notas: string | null; created_at: string;
}

export interface Corte { clave: string; monto: number; cuantos: number }

export interface Resumen {
  desde: string; hasta: string;
  ventas: { total: number; cuantas: number; por_medio: Corte[]; por_categoria: Corte[] };
  gastos: { total: number; cuantos: number; por_categoria: Corte[]; por_medio: Corte[] };
  queda: number;
}

export interface Impresora { id: string; nombre: string; notas: string | null; activa: boolean }

export interface Impresion {
  id: string; pieza: string; cliente: string | null; cantidad: number; horas: number;
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
