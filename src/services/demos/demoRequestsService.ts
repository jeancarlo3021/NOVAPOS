import { apiFetch } from '@/lib/api';

export type DemoStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'entregada' | 'convertida' | 'vencida';

export interface DemoRequest {
  id: string;
  number?: string | null;
  business_name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_type?: string | null;
  notes?: string | null;
  /** Claves de los módulos que se quieren mostrar. */
  modules: string[];
  days: number;
  status: DemoStatus;
  reject_reason?: string | null;
  requested_by?: string | null;
  requester_name?: string | null;
  demo_tenant_id?: string | null;
  demo_user?: string | null;
  /** Clave de la demo. Se genera con el nombre del negocio para poder dictarla. */
  demo_password?: string | null;
  expires_on?: string | null;
  delivered_at?: string | null;
  /** Convertida en cliente: con qué plan y cuándo. */
  converted_plan_id?: string | null;
  converted_at?: string | null;
  /** Día en que la demo se borra sola si nadie la convierte. */
  purge_on?: string | null;
  created_at?: string;
}

export interface DemoRequestInput {
  business_name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_type?: string | null;
  notes?: string | null;
  modules: string[];
  days?: number;
}

export const demoRequestsService = {
  /** status: 'abiertas' (pendientes + aprobadas) | una concreta | 'all'. */
  list: (opts?: { status?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (opts?.status) p.set('status', opts.status);
    if (opts?.q) p.set('q', opts.q);
    const qs = p.toString();
    return apiFetch<DemoRequest[]>(`/demo-requests${qs ? '?' + qs : ''}`);
  },

  create: (d: DemoRequestInput) =>
    apiFetch<DemoRequest>('/demo-requests', { method: 'POST', body: JSON.stringify(d) }),

  update: (id: string, d: Partial<DemoRequestInput>) =>
    apiFetch<DemoRequest>(`/demo-requests/${id}`, { method: 'PUT', body: JSON.stringify(d) }),

  /** Vuelve a generar (o fija a mano) el usuario y la clave de la demo. */
  regenerateCredentials: (id: string, manual?: { demo_user: string; demo_password?: string }) =>
    apiFetch<DemoRequest>(`/demo-requests/${id}/credentials`, {
      method: 'POST', body: JSON.stringify(manual ?? {}),
    }),

  /**
   * Arma la demo de verdad: crea el negocio de prueba con los módulos pedidos y
   * el usuario que va a entrar. Devuelve el acceso listo para dictar.
   */
  provision: (id: string) =>
    apiFetch<DemoRequest & { login: { user: string; password: string; email: string } }>(
      `/demo-requests/${id}/provision`, { method: 'POST' }),

  /** Planes que se pueden asignar al convertir una demo en cliente. */
  plans: () => apiFetch<Array<{ id: string; name: string; price: number; billing_cycle: string }>>(
    '/demo-requests/plans'),

  /**
   * Al cliente le gustó: se le asigna plan, el negocio deja de ser demo y se
   * queda con todo lo que cargó durante la prueba.
   */
  convert: (id: string, planId: string) =>
    apiFetch<DemoRequest & { login?: { user: string; password: string; email: string } }>(
      `/demo-requests/${id}/convert`, {
      method: 'POST', body: JSON.stringify({ plan_id: planId }),
    }),

  /** Aprobar / rechazar / entregar. Solo gerencia. */
  setStatus: (id: string, data: {
    status: DemoStatus;
    reject_reason?: string;
    demo_tenant_id?: string;
    demo_user?: string;
    demo_password?: string;
    expires_on?: string;
  }) => apiFetch<DemoRequest>(`/demo-requests/${id}/status`, {
    method: 'POST', body: JSON.stringify(data),
  }),

  remove: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/demo-requests/${id}`, { method: 'DELETE' }),
};

export default demoRequestsService;
