import { apiFetch } from '@/lib/api';

/**
 * MESA DIGITAL — el QR de la mesa, los avisos del cliente y el panel del local.
 *
 * Dos clientes distintos en un archivo:
 *  · `mesaPublica` — lo usa la pantalla que abre el COMENSAL. No manda sesión y
 *    resuelve la dirección del API sola, porque esa página se abre desde un
 *    teléfono ajeno donde `localhost` no existe (ver `baseApi`).
 *  · `mesaAdmin`   — lo usa el panel del negocio, con la sesión normal.
 */

export type TipoLlamada = 'ordenar' | 'mesero' | 'cuenta';
export type MedioPago   = 'efectivo' | 'tarjeta' | 'sinpe';
export type OrigenVisita = 'qr' | 'nfc' | 'enlace';

export interface MesaConfig {
  activo: boolean;
  wifi_ssid: string; wifi_password: string;
  whatsapp: string; sinpe_telefono: string; sinpe_nombre: string;
  instagram: string; tiktok: string; google_review: string; maps_url: string;
  direccion: string; horario: string;
  ver_mesero: boolean; ver_cuenta: boolean; ver_ordenar: boolean;
  ver_juegos: boolean; ver_sugerencias: boolean;
  mensaje: string;
  cantidad_mesas: number;
}

export interface MesaPublica {
  atiende: boolean;
  negocio: { nombre: string; logo_url?: string | null; color?: string | null };
  mesa: { numero: number; nombre?: string | null };
  menu?: { slug: string; kind: string } | null;
  config?: Omit<MesaConfig, 'activo' | 'cantidad_mesas'>;
}

export interface Llamada {
  id: string;
  numero: number;
  tipo: TipoLlamada;
  personas: number | null;
  medio_pago: MedioPago | null;
  estado: 'pendiente' | 'atendida';
  created_at: string;
  atendida_at: string | null;
}

export interface MesaQr { numero: number; nombre: string | null; token: string }

export interface Sugerencia {
  id: string; numero: number | null; estrellas: number | null;
  mensaje: string; created_at: string;
}

export interface ResumenMesas {
  dias: number;
  visitas: number;
  por_origen: Record<OrigenVisita, number>;
  llamadas: number;
  por_tipo: Record<TipoLlamada, number>;
  pendientes: number;
  minutos_promedio: number | null;
  por_mesa: Record<string, { visitas: number; llamadas: number }>;
}

/**
 * Base del API para la página del comensal.
 *
 * Misma razón que en el menú público: `VITE_API_URL` se congela al compilar y
 * suele quedar en `localhost:3001`. En el teléfono del cliente «localhost» es su
 * propio teléfono, así que la pantalla de la mesa nunca cargaría.
 */
function baseApi(): string {
  const puesta = String((import.meta as any).env?.VITE_API_URL ?? '').replace(/\/+$/, '');
  const apiLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(puesta);
  const paginaLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  if (!puesta || (apiLocal && !paginaLocal)) return window.location.origin;
  return puesta;
}

const sinSesion = async <T>(ruta: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`${baseApi()}/api/mesa${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || cuerpo?.error) throw new Error(cuerpo?.error ?? `Error ${r.status}`);
  return cuerpo?.data as T;
};

export const mesaPublica = {
  /** Todo lo de la mesa en un viaje: la señal en un restaurante es mala. */
  abrir: (token: string, origen: OrigenVisita = 'qr') =>
    sinSesion<MesaPublica>(`/${encodeURIComponent(token)}?origen=${origen}`),

  llamar: (token: string, body: { tipo: TipoLlamada; personas?: number | null; medio_pago?: MedioPago | null }) =>
    sinSesion<{ id: string; repetido: boolean }>(`/${encodeURIComponent(token)}/llamar`, {
      method: 'POST', body: JSON.stringify(body),
    }),

  sugerir: (token: string, body: { estrellas?: number | null; mensaje: string }) =>
    sinSesion<{ enviado: boolean }>(`/${encodeURIComponent(token)}/sugerencia`, {
      method: 'POST', body: JSON.stringify(body),
    }),
};

export const mesaAdmin = {
  config:        () => apiFetch<MesaConfig>('/mesa-digital/config'),
  guardarConfig: (c: Partial<MesaConfig>) =>
    apiFetch<MesaConfig>('/mesa-digital/config', { method: 'PUT', body: JSON.stringify(c) }),

  mesas:         () => apiFetch<MesaQr[]>('/mesa-digital/mesas'),
  ponerCantidad: (cantidad: number, confirmar = false) =>
    apiFetch<MesaQr[]>('/mesa-digital/mesas', { method: 'PUT', body: JSON.stringify({ cantidad, confirmar }) }),
  renombrar:     (numero: number, nombre: string) =>
    apiFetch(`/mesa-digital/mesas/${numero}`, { method: 'PUT', body: JSON.stringify({ nombre }) }),
  /** Sin `numero`, cambia el código de TODAS las mesas. */
  regenerar:     (numero?: number) =>
    apiFetch<MesaQr[]>('/mesa-digital/mesas/regenerar', {
      method: 'POST', body: JSON.stringify(numero != null ? { numero } : {}),
    }),

  llamadas:      (estado: 'pendiente' | 'atendida' | 'todas' = 'pendiente') =>
    apiFetch<Llamada[]>(`/mesa-digital/llamadas?estado=${estado}`),
  atender:       (id: string) =>
    apiFetch(`/mesa-digital/llamadas/${id}/atendida`, { method: 'PATCH' }),

  sugerencias:   () => apiFetch<Sugerencia[]>('/mesa-digital/sugerencias'),
  borrarSugerencia: (id: string) =>
    apiFetch(`/mesa-digital/sugerencias/${id}`, { method: 'DELETE' }),

  resumen:       (dias = 7) => apiFetch<ResumenMesas>(`/mesa-digital/resumen?dias=${dias}`),
};

/** La dirección que va en el QR de una mesa. */
export const enlaceMesa = (token: string, origen: OrigenVisita = 'qr'): string =>
  `${window.location.origin}/mesa/${token}${origen === 'qr' ? '' : `?origen=${origen}`}`;
