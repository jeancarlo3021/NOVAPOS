import { apiFetch } from '@/lib/api';

/** TALLER 3D — ventas y gastos del día, y la cola de impresión. */

export type MedioPago = 'efectivo' | 'sinpe' | 'tarjeta' | 'transferencia' | 'otro';
export type CatVenta = 'impresion' | 'diseno' | 'material' | 'reparacion' | 'otro';
export type CatGasto = 'filamento' | 'resina' | 'electricidad' | 'repuestos' | 'envio' | 'otro';
export type EstadoImpresion = 'en_cola' | 'programado' | 'imprimiendo' | 'listo' | 'entregado' | 'cancelado';

/** Una línea de la venta. El envío NO es una línea: va en la cabeza. */
export interface VentaItem {
  id?: string;
  producto_id: string | null;
  descripcion: string;
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Venta {
  id: string; fecha: string;
  /** Resumen de la venta: «Llavero y 2 más». El detalle está en `items`. */
  descripcion: string; cliente: string | null;
  cantidad: number; precio_unitario: number; total: number;
  medio_pago: MedioPago; categoria: CatVenta; notas: string | null; created_at: string;
  /** Con una sola línea, la cabeza repite su artículo. Con varias, van null. */
  producto_id: string | null; variante: string | null;
  /** El envío se cobra aparte de las piezas. */
  envio: number; envio_etiqueta: string | null;
  items?: VentaItem[];
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

/** Un día del período: lo que entró y lo que salió ese día. */
export interface DiaCorte { fecha: string; ventas: number; gastos: number; queda: number }

/**
 * La comisión del período, con el cálculo completo.
 *
 * Se guarda el desglose y no solo el monto a propósito: una comisión que no se
 * puede recalcular a mano no se discute, se pelea.
 */
export interface Comision {
  porcentaje_ventas: number; porcentaje_gastos: number;
  ventas: number; gastos: number;
  /** El 15 % de los gastos, lo que se le resta a las ventas. */
  gastos_descontados: number;
  /** Ventas menos ese descuento: sobre esto se saca el porcentaje. */
  base: number;
  monto: number;
}

export interface Resumen {
  desde: string; hasta: string;
  /** Día por día, para el reporte de la semana. */
  por_dia?: DiaCorte[];
  comision?: Comision;
  ventas: {
    total: number; cuantas: number;
    /** Lo cobrado por las piezas, sin el envío. */
    piezas: number; envios: number; cuantos_envios: number;
    /** Cuántos artículos se movieron, sin contar el envío. */
    articulos: number;
    por_medio: Corte[]; por_categoria: Corte[]; por_producto: Corte[];
  };
  gastos: { total: number; cuantos: number; por_categoria: Corte[]; por_medio: Corte[] };
  queda: number;
}

/** Un artículo del encargo. */
export interface EntregaItem {
  id?: string;
  producto_id: string | null;
  descripcion: string;
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export type EstadoPago = 'sin_pago' | 'adelanto' | 'pagado';
export type EstadoEntrega = 'pendiente' | 'entregado' | 'cancelado';

/**
 * Una ENTREGA PENDIENTE: lo que se prometió, para cuándo y cuánto falta cobrar.
 *
 * No es una venta. La venta es plata que ya entró; esto es un compromiso, y lo
 * que importa de él es el saldo.
 */
export interface Entrega {
  id: string; fecha_entrega: string;
  cliente: string; telefono: string | null; customer_id?: string | null;
  total: number;
  /** Lo que el cliente ya dejó pagado. */
  adelanto: number;
  /** Derivado de los montos en el servidor, nunca escrito a mano. */
  estado_pago: EstadoPago;
  /** total - adelanto. Lo calcula el servidor. */
  saldo?: number;
  medio_pago: MedioPago | null;
  estado: EstadoEntrega;
  entregado_at: string | null; entregado_nombre: string | null;
  notas: string | null; created_at: string;
  items?: EntregaItem[];
  /** Pendiente y con la fecha ya pasada. */
  atrasada?: boolean;
}

export interface DiaEntregas {
  fecha: string; items: Entrega[];
  total: number; adelantos: number; saldo: number;
}

export interface CalendarioEntregas {
  desde: string; hasta: string;
  dias: DiaEntregas[];
  /** Lo que se prometió y no salió. Va aparte para que no se pierda de vista. */
  atrasadas: Entrega[];
  totales: {
    pendientes: number; atrasadas: number;
    total: number; adelantos: number; saldo: number;
  };
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
  /** Porcentaje de las ventas que es comisión. */
  comision_ventas: number;
  /** Porcentaje de los gastos que se le descuenta a las ventas antes. */
  comision_gastos: number;
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

  // ── Entregas pendientes ──
  entregas: (desde?: string, hasta?: string, estado?: string) =>
    apiFetch<Entrega[]>(`/taller-3d/entregas${qs({ desde, hasta, estado })}`),
  calendarioEntregas: (desde?: string, hasta?: string) =>
    apiFetch<CalendarioEntregas>(`/taller-3d/entregas/calendario${qs({ desde, hasta })}`),
  nuevaEntrega: (e: Record<string, unknown>) =>
    apiFetch<Entrega>('/taller-3d/entregas', { method: 'POST', body: JSON.stringify(e) }),
  cambiarEntrega: (id: string, e: Record<string, unknown>) =>
    apiFetch<Entrega>(`/taller-3d/entregas/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  /** Entró plata: `monto` es lo que ACABA de pagar, no el acumulado. */
  abonar: (id: string, p: { monto?: number; completo?: boolean; medio_pago?: MedioPago }) =>
    apiFetch<Entrega>(`/taller-3d/entregas/${id}/pago`, { method: 'POST', body: JSON.stringify(p) }),
  estadoEntrega: (id: string, estado: EstadoEntrega) =>
    apiFetch<Entrega>(`/taller-3d/entregas/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) }),
  borrarEntrega: (id: string) => apiFetch(`/taller-3d/entregas/${id}`, { method: 'DELETE' }),

  config: () => apiFetch<ConfigTaller>('/taller-3d/config'),
  guardarConfig: (c: Partial<ConfigTaller>) =>
    apiFetch<ConfigTaller>('/taller-3d/config', { method: 'PUT', body: JSON.stringify(c) }),
};

export default taller3d;
