import { apiFetch } from '@/lib/api';

/**
 * PORTAL DEL CLIENTE — el enlace que el negocio le manda a su cliente.
 *
 * Dos clientes en un archivo, igual que la mesa digital:
 *  · `portalPublico` — lo usa la página que abre EL CLIENTE. Sin sesión, y
 *    resolviendo la dirección del API sola, porque esa página se abre desde un
 *    teléfono ajeno donde `localhost` no existe (ver `baseApi`).
 *  · `portalAdmin`   — lo usa el negocio, con la sesión normal.
 *
 * Nada de lo que viaja desde el teléfono decide precio ni existencias: el
 * servidor los vuelve a resolver al recibir el pedido (ver
 * routes/portalCliente.ts). Acá los precios son para MOSTRAR.
 */

// ── Lo que devuelve el servidor ──────────────────────────────────────────────

export interface PortalCorte {
  abierto: boolean;
  motivo: 'abierto' | 'apagado' | 'dia-no' | 'paso-la-hora';
  minutos_restantes: number | null;
  hora_corte: string;
}

export interface PortalInicio {
  atiende: boolean;
  negocio: { nombre: string };
  cliente?: {
    id: string; nombre: string; telefono: string | null;
    credito: boolean; limite: number;
  };
  permisos?: { pedir: boolean; ver_saldo: boolean; pide_pin: boolean };
  corte?: PortalCorte;
  config?: { ver_existencias: boolean; mensaje_cerrado: string; minutos_para_editar: number };
}

export interface PortalProducto {
  id: string;
  nombre: string;
  sku: string | null;
  categoria_id: string | null;
  imagen: string | null;
  precio: number;
  /** Solo viene cuando el precio del cliente es MENOR que el de lista. */
  precio_lista: number | null;
  es_precio_propio: boolean;
  /** null = no se muestran existencias (stock infinito o apagado por el dueño). */
  existencias: number | null;
  sin_existencias: boolean;
}

export interface PortalCatalogo {
  categorias: Array<{ id: string; nombre: string }>;
  productos: PortalProducto[];
}

export interface PortalPedido {
  id: string;
  numero: string | null;
  total: number;
  estado: string;
  estado_texto: string;
  motivo: string | null;
  cuando: string;
  notas: string | null;
  editable: boolean;
  lineas: Array<{ product_id: string | null; nombre: string; cantidad: number; precio: number; total: number }>;
}

export interface PortalCuenta {
  facturas: Array<{
    id: string; numero: string | null; total: number; abonado: number;
    saldo: number; vence: string | null; vencida: boolean;
  }>;
  total: number;
  vencido: number;
  limite: number;
  credito: boolean;
}

export interface PedidoEnviado {
  numero: string; id: string; total: number;
  editable_hasta: string;
  /** Líneas que no entraron (se agotó, cambió el producto…). */
  problemas: string[];
  /** Pasó su límite de crédito: se avisa, no se bloquea. */
  aviso: string | null;
}

export interface PortalConfig {
  activo: boolean;
  hora_corte: string;
  dias: number[];
  minutos_para_editar: number;
  mensaje_cerrado: string;
  ver_existencias: boolean;
  avisar_limite: boolean;
}

export interface PortalEnlace {
  id: string;
  customer_id: string;
  token: string;
  puede_pedir: boolean;
  puede_ver_saldo: boolean;
  tiene_pin: boolean;
  vence_el: string | null;
  ultimo_uso: string | null;
  usos: number;
  created_at: string;
}

// ── El lado público ──────────────────────────────────────────────────────────

/**
 * La dirección del API cuando la página se abre SIN sesión.
 *
 * Mismo criterio que la mesa digital: si `VITE_API_URL` apunta a localhost y la
 * página no se está viendo en localhost, el valor compilado no sirve —ese
 * «localhost» es el teléfono del cliente, no el servidor—, así que se usa el
 * mismo origen de la página.
 */
function baseApi(): string {
  const puesta = String((import.meta as any).env?.VITE_API_URL ?? '').replace(/\/+$/, '');
  const apiLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(puesta);
  const paginaLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  if (!puesta || (apiLocal && !paginaLocal)) return window.location.origin;
  return puesta;
}

const sinSesion = async <T>(ruta: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`${baseApi()}/api/cliente${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || cuerpo?.error) throw new Error(cuerpo?.error ?? `Error ${r.status}`);
  return cuerpo?.data as T;
};

export type LineaCarrito = { product_id: string; quantity: number };

export const portalPublico = {
  /** Todo lo de la pantalla en un viaje: esto se abre con datos móviles. */
  abrir: (token: string) => sinSesion<PortalInicio>(`/${encodeURIComponent(token)}`),

  catalogo: (token: string) => sinSesion<PortalCatalogo>(`/${encodeURIComponent(token)}/catalogo`),

  pedir: (token: string, items: LineaCarrito[], notes?: string | null) =>
    sinSesion<PedidoEnviado>(`/${encodeURIComponent(token)}/pedido`, {
      method: 'POST', body: JSON.stringify({ items, notes: notes ?? null }),
    }),

  pedidos: (token: string) => sinSesion<PortalPedido[]>(`/${encodeURIComponent(token)}/pedidos`),

  cambiar: (token: string, id: string, items: LineaCarrito[], notes?: string | null) =>
    sinSesion<{ total: number; problemas: string[] }>(`/${encodeURIComponent(token)}/pedido/${id}`, {
      method: 'PUT', body: JSON.stringify({ items, notes: notes ?? null }),
    }),

  cancelar: (token: string, id: string) =>
    sinSesion<{ cancelado: boolean }>(`/${encodeURIComponent(token)}/pedido/${id}/cancelar`, { method: 'POST' }),

  cuenta: (token: string, pin?: string) =>
    sinSesion<PortalCuenta>(`/${encodeURIComponent(token)}/cuenta${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`),
};

// ── El lado del negocio ──────────────────────────────────────────────────────

export const portalAdmin = {
  config: () => apiFetch<PortalConfig>('/portal-cliente/config'),
  guardarConfig: (cfg: Partial<PortalConfig>) =>
    apiFetch<PortalConfig>('/portal-cliente/config', { method: 'PUT', body: JSON.stringify(cfg) }),

  enlaces: () => apiFetch<PortalEnlace[]>('/portal-cliente/enlaces'),

  /** Crea o REGENERA el de un cliente: el token viejo deja de abrir. */
  crearEnlace: (body: {
    customer_id: string;
    puede_pedir?: boolean; puede_ver_saldo?: boolean;
    pin?: string | null; vence_el?: string | null;
  }) => apiFetch<PortalEnlace>('/portal-cliente/enlaces', { method: 'POST', body: JSON.stringify(body) }),

  revocar: (customerId: string) =>
    apiFetch<{ revocado: boolean }>(`/portal-cliente/enlaces/${customerId}`, { method: 'DELETE' }),
};

/**
 * ¿Este usuario puede crear enlaces o cambiar la configuración del portal?
 *
 * Mismo criterio que el servidor (`puedeDelPortal` en routes/portalCliente.ts):
 * el dueño y el administrador siempre; cualquier otro rol SOLO si el dueño se
 * lo concedió a mano en Usuarios → Roles, módulo «Portal del cliente».
 *
 * A propósito es más estricto que `canDo`, que deja pasar a todos mientras el
 * negocio no haya configurado ninguna matriz: si acá dijera lo mismo, el cajero
 * de un negocio recién abierto vería el botón y el servidor le respondería 403.
 * Un botón que falla es peor que un botón que no está.
 */
export function puedeDelPortal(
  matrix: Record<string, { can_access?: boolean; can_create?: boolean; can_edit?: boolean; can_delete?: boolean }>,
  esDuenoOAdmin: boolean,
  accion: 'create' | 'edit' | 'delete',
): boolean {
  if (esDuenoOAdmin) return true;
  const fila = matrix?.portal_cliente;
  return !!fila && fila.can_access === true && fila[`can_${accion}`] === true;
}

/** La dirección que se le manda al cliente. */
export const urlDelEnlace = (token: string) =>
  `${window.location.origin}/cliente/${token}`;

export default portalPublico;
