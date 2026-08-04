import { apiFetch } from '@/lib/api';

/**
 * Agentes de venta y sus pedidos hacia caja.
 *
 * El agente arma el pedido y lo ENVÍA; el cajero lo ve en su bandeja, lo TOMA
 * (queda reservado para él) y lo cobra en el POS con el flujo normal.
 */

export interface SalesAgent {
  id: string;
  tenant_id?: string;
  name: string;
  user_id?: string | null;
  phone?: string | null;
  email?: string | null;
  identification?: string | null;
  /** % sobre la venta cobrada. */
  commission_percent: number;
  is_active: boolean;
  notes?: string | null;
}

export interface AgentOrderItem {
  id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes?: string | null;
}

export type AgentOrderStatus = 'pending' | 'taken' | 'charged' | 'cancelled';

export interface AgentOrder {
  id: string;
  number?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  status: AgentOrderStatus;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  /** Comprobante que pidió el cliente, elegido por el agente. */
  document_type?: 'ticket' | 'tiquete_electronico' | 'factura_electronica';
  total: number;
  commission_amount?: number | null;
  invoice_id?: string | null;
  taken_by?: string | null;
  taken_at?: string | null;
  created_at: string;
  charged_at?: string | null;
  items: AgentOrderItem[];
  item_count?: number;
}

export const salesAgentsService = {
  list: () => apiFetch<SalesAgent[]>('/sales-agents'),
  /** Crea el agente. Con `create_user` también le crea su usuario del sistema
   *  (rol 'agente'), que queda vinculado y visible en Usuarios. */
  create: (a: Partial<SalesAgent> & { create_user?: boolean; username?: string; password?: string }) =>
    apiFetch<SalesAgent & { user_created?: boolean }>('/sales-agents', {
      method: 'POST', body: JSON.stringify(a),
    }),
  update: (id: string, a: Partial<SalesAgent>) =>
    apiFetch<SalesAgent>(`/sales-agents/${id}`, { method: 'PUT', body: JSON.stringify(a) }),
  /** Desactiva (no borra): los pedidos históricos deben seguir apuntando a alguien. */
  deactivate: (id: string) =>
    apiFetch<{ ok: boolean }>(`/sales-agents/${id}`, { method: 'DELETE' }),

  report: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const qs = p.toString();
    return apiFetch<{
      rows: Array<{ agent_id: string | null; agent_name: string; commission_percent: number; orders: number; total: number; commission: number }>;
      orders: any[];
      totals: { orders: number; total: number; commission: number };
    }>(`/sales-agents/report${qs ? '?' + qs : ''}`);
  },
};

export const agentOrdersService = {
  /** Bandeja. status: pending (default) | taken | charged | cancelled | all */
  list: (status?: string, agentId?: string) => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (agentId) p.set('agent_id', agentId);
    const qs = p.toString();
    return apiFetch<AgentOrder[]>(`/agent-orders${qs ? '?' + qs : ''}`);
  },

  get: (id: string) => apiFetch<AgentOrder>(`/agent-orders/${id}`),

  /** El agente envía el pedido a caja. */
  send: (data: {
    agent_id?: string | null; agent_name?: string | null;
    customer_id?: string | null; customer_name?: string | null; customer_phone?: string | null;
    notes?: string | null; document_type?: string; items: AgentOrderItem[];
  }) => apiFetch<AgentOrder>('/agent-orders', { method: 'POST', body: JSON.stringify(data) }),

  /** Agente vinculado al usuario logueado (para poner su nombre solo). */
  me: () => apiFetch<{ id: string; name: string; commission_percent: number } | null>('/agent-orders/me'),

  /** El cajero lo reserva. Falla con 409 si otro cajero se le adelantó. */
  take: (id: string) => apiFetch<AgentOrder>(`/agent-orders/${id}/take`, { method: 'POST' }),

  /** Lo devuelve a la bandeja sin cobrarlo. */
  release: (id: string) => apiFetch<AgentOrder>(`/agent-orders/${id}/release`, { method: 'POST' }),

  /** Cobrado: liga la factura y calcula la comisión. */
  charge: (id: string, invoiceId?: string | null, total?: number) =>
    apiFetch<AgentOrder>(`/agent-orders/${id}/charge`, {
      method: 'POST', body: JSON.stringify({ invoice_id: invoiceId ?? null, total }),
    }),

  cancel: (id: string) => apiFetch<AgentOrder>(`/agent-orders/${id}/cancel`, { method: 'POST' }),
};

export default salesAgentsService;
