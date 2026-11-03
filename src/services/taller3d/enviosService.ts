import { apiFetch } from '@/lib/api';

/** ENVÍOS DEL EQUIPO — lo que hay que mandar y a quién hay que escribirle. */

export type MedioEnvio = 'correos' | 'uber' | 'mensajero' | 'retiro' | 'otro';
export type EstadoEnvio = 'pendiente' | 'enviado' | 'entregado' | 'cancelado';

export interface Envio {
  id: string; cliente: string; telefono: string | null; direccion: string | null;
  detalle: string | null; medio: MedioEnvio; estado: EstadoEnvio; fecha: string;
  registrado_nombre: string | null; despachado_nombre: string | null;
  despachado_at: string | null; guia: string | null; notas: string | null; created_at: string;
}

export interface Contacto {
  id: string; cliente: string; telefono: string | null; motivo: string | null;
  estado: 'pendiente' | 'hecho'; fecha: string;
  registrado_nombre: string | null; hecho_nombre: string | null;
  hecho_at: string | null; resultado: string | null; created_at: string;
}

export interface ResumenEquipo {
  envios: { pendientes: number; atrasados: number; enviados_hoy: number };
  contactos: { pendientes: number; atrasados: number };
  por_persona: Array<{ nombre: string; pendientes: number; despachados: number }>;
}

export const enviosEquipo = {
  lista: (estado = 'pendiente') => apiFetch<Envio[]>(`/envios?estado=${estado}`),
  nuevo: (e: Partial<Envio>) => apiFetch<Envio>('/envios', { method: 'POST', body: JSON.stringify(e) }),
  cambiar: (id: string, e: Partial<Envio>) =>
    apiFetch<Envio>(`/envios/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  estado: (id: string, estado: EstadoEnvio, guia?: string) =>
    apiFetch<Envio>(`/envios/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado, guia }) }),
  borrar: (id: string) => apiFetch(`/envios/${id}`, { method: 'DELETE' }),

  contactos: (estado = 'pendiente') => apiFetch<Contacto[]>(`/envios/contactos?estado=${estado}`),
  nuevoContacto: (c: Partial<Contacto>) =>
    apiFetch<Contacto>('/envios/contactos', { method: 'POST', body: JSON.stringify(c) }),
  contactoHecho: (id: string, resultado: string) =>
    apiFetch<Contacto>(`/envios/contactos/${id}/hecho`, { method: 'POST', body: JSON.stringify({ resultado }) }),
  borrarContacto: (id: string) => apiFetch(`/envios/contactos/${id}`, { method: 'DELETE' }),

  resumen: () => apiFetch<ResumenEquipo>('/envios/resumen'),
};

export default enviosEquipo;
