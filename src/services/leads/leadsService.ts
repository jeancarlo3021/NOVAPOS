import { apiFetch } from '@/lib/api';

export type LeadStatus = 'nuevo' | 'contactado' | 'cotizado' | 'negociacion' | 'ganado' | 'perdido';

export interface LeadInteraction {
  id: string;
  lead_id: string;
  kind: string;                 // llamada | whatsapp | visita | correo | mensaje | cotizacion | venta | otro
  note?: string | null;
  status_after?: string | null;
  happened_at: string;
  next_follow_up?: string | null;
  created_at?: string;
}

export interface Lead {
  id: string;
  number?: string | null;
  customer_id?: string | null;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  zone?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  source?: string | null;
  interest?: string | null;
  estimated_amount: number;
  status: LeadStatus;
  lost_reason?: string | null;
  last_contact_at?: string | null;
  next_follow_up?: string | null;
  proforma_id?: string | null;
  agent_order_id?: string | null;
  invoice_id?: string | null;
  closed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  interactions?: LeadInteraction[];
}

export interface LeadInput {
  customer_id?: string | null;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  zone?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  source?: string | null;
  interest?: string | null;
  estimated_amount?: number;
  next_follow_up?: string | null;
  status?: LeadStatus;
}

export const leadsService = {
  /** status: 'abiertos' (default de trabajo) | una etapa | 'all'. due=1 → ya tocaba. */
  list: (opts?: { status?: string; agent_id?: string; q?: string; due?: boolean }) => {
    const p = new URLSearchParams();
    if (opts?.status) p.set('status', opts.status);
    if (opts?.agent_id) p.set('agent_id', opts.agent_id);
    if (opts?.q) p.set('q', opts.q);
    if (opts?.due) p.set('due', '1');
    const qs = p.toString();
    return apiFetch<Lead[]>(`/leads${qs ? '?' + qs : ''}`);
  },

  summary: () => apiFetch<{
    by_status: Record<string, { count: number; amount: number }>;
    overdue: number;
    today: number;
  }>('/leads/summary'),

  get: (id: string) => apiFetch<Lead>(`/leads/${id}`),

  create: (l: LeadInput) => apiFetch<Lead>('/leads', { method: 'POST', body: JSON.stringify(l) }),

  update: (id: string, l: Partial<LeadInput> & { lost_reason?: string | null }) =>
    apiFetch<Lead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(l) }),

  /** Registra un toque con el cliente (y mueve la etapa si se indica). */
  addInteraction: (id: string, i: {
    kind?: string; note?: string | null; happened_at?: string | null;
    next_follow_up?: string | null; status?: LeadStatus;
  }) => apiFetch<{ interaction: LeadInteraction; lead: Lead }>(`/leads/${id}/interactions`, {
    method: 'POST', body: JSON.stringify(i),
  }),

  /** Cierra el seguimiento: ganado (con su venta) o perdido (con el motivo). */
  close: (id: string, data: {
    status: 'ganado' | 'perdido';
    lost_reason?: string | null;
    invoice_id?: string | null;
    proforma_id?: string | null;
    agent_order_id?: string | null;
    estimated_amount?: number;
    note?: string | null;
  }) => apiFetch<Lead>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),

  remove: (id: string) => apiFetch<{ deleted: boolean }>(`/leads/${id}`, { method: 'DELETE' }),
};

export default leadsService;
