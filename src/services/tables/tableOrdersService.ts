import { apiFetch } from '@/lib/api';

/**
 * Cuentas por mesa. El mapa de mesas (settings/tables-map) es solo el plano; la
 * CUENTA de cada mesa vive acá: se abre al sentar clientes, acumula rondas de
 * consumo y se cierra al cobrar en el POS.
 */

export interface TableOrderItem {
  id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  subtotal: number;
  /** Nota de cocina de la línea ("sin cebolla"). */
  notes?: string | null;
  /** Ronda en que se pidió (1, 2, 3…). */
  course?: number;
  sent_to_kitchen?: boolean;
  created_at?: string;
}

export interface TableOrder {
  id: string;
  tenant_id: string;
  table_id: string;
  table_label?: string | null;
  status: 'open' | 'closed' | 'cancelled';
  guests?: number;
  notes?: string | null;
  opened_by?: string | null;
  opened_at: string;
  closed_at?: string | null;
  invoice_id?: string | null;
  items: TableOrderItem[];
  total: number;
  item_count?: number;
  /** true cuando "abrir" devolvió una cuenta que ya estaba abierta. */
  already_open?: boolean;
}

export const tableOrdersService = {
  /** Cuentas abiertas (para pintar el mapa con lo que consume cada mesa). */
  open: () => apiFetch<TableOrder[]>('/table-orders'),

  get: (id: string) => apiFetch<TableOrder>(`/table-orders/${id}`),

  /** Abre la cuenta de una mesa. Si ya había una abierta devuelve ESA (no falla):
   *  dos meseros tocando la misma mesa tienen que caer en la misma cuenta. */
  open_: (data: {
    table_id: string; table_label?: string; guests?: number;
    notes?: string; items?: TableOrderItem[];
  }) => apiFetch<TableOrder>('/table-orders', { method: 'POST', body: JSON.stringify(data) }),

  /** Agrega una RONDA de consumo a la cuenta. */
  addItems: (id: string, items: TableOrderItem[]) =>
    apiFetch<{ course: number; items: TableOrderItem[] }>(`/table-orders/${id}/items`, {
      method: 'POST', body: JSON.stringify({ items }),
    }),

  removeItem: (id: string, itemId: string) =>
    apiFetch<{ ok: boolean }>(`/table-orders/${id}/items/${itemId}`, { method: 'DELETE' }),

  /** Comensales, notas, o MOVER la cuenta a otra mesa. */
  update: (id: string, patch: { guests?: number; notes?: string; table_id?: string; table_label?: string }) =>
    apiFetch<TableOrder>(`/table-orders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  /** Cierra la cuenta al cobrar (el cobro lo hace el POS). */
  close: (id: string, invoiceId?: string | null) =>
    apiFetch<TableOrder>(`/table-orders/${id}/close`, {
      method: 'POST', body: JSON.stringify({ invoice_id: invoiceId ?? null }),
    }),

  /** Anula la cuenta sin cobrar. */
  cancel: (id: string) =>
    apiFetch<TableOrder>(`/table-orders/${id}/cancel`, { method: 'POST' }),
};

export default tableOrdersService;
