import { apiFetch } from '@/lib/api';

/**
 * Devoluciones.
 *
 * La ANULACIÓN total de una factura vive en el módulo de facturas (marca la venta
 * cancelada y repone todo el stock). Acá está la devolución PARCIAL —el cliente
 * trae 2 de 5— que no es una anulación porque la venta sigue existiendo por el
 * resto, y las devoluciones AL PROVEEDOR.
 */

export interface SalesReturnItem {
  id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface SalesReturn {
  id: string;
  number?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  reason?: string | null;
  /** refund = plata de vuelta · credit = queda a favor · exchange = cambio */
  resolution: 'refund' | 'credit' | 'exchange';
  total: number;
  restock: boolean;
  fe_nc_clave?: string | null;
  created_at: string;
  items: SalesReturnItem[];
  warnings?: string[];
}

export interface SupplierReturnItem {
  id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

export interface SupplierReturn {
  id: string;
  number?: string | null;
  purchase_id?: string | null;
  purchase_number?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  reason?: string | null;
  /** credit_note = nota de crédito del proveedor · refund = plata · replacement = reposición */
  resolution: 'credit_note' | 'refund' | 'replacement';
  total: number;
  status: 'pending' | 'settled';
  created_at: string;
  settled_at?: string | null;
  items: SupplierReturnItem[];
  warnings?: string[];
}

/** Línea de la venta con cuánto queda por devolver. */
export interface ReturnableLine {
  product_id?: string | null;
  product_name?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  already_returned: number;
  returnable: number;
}

export const returnsService = {
  // ── Cliente ───────────────────────────────────────────────────────────────
  listSales: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const qs = p.toString();
    return apiFetch<SalesReturn[]>(`/returns/sales${qs ? '?' + qs : ''}`);
  },

  /** Venta con lo ya devuelto por línea, para no dejar devolver de más. */
  invoiceForReturn: (invoiceId: string) =>
    apiFetch<any & { items: ReturnableLine[] }>(`/returns/sales/invoice/${invoiceId}`),

  createSales: (data: {
    invoice_id?: string | null; invoice_number?: string | null;
    customer_id?: string | null; customer_name?: string | null;
    reason?: string | null; resolution?: 'refund' | 'credit' | 'exchange';
    restock?: boolean; cash_session_id?: string | null; fe_nc_clave?: string | null;
    items: SalesReturnItem[];
  }) => apiFetch<SalesReturn>('/returns/sales', { method: 'POST', body: JSON.stringify(data) }),

  // ── Proveedor ─────────────────────────────────────────────────────────────
  listSupplier: (status?: string) =>
    apiFetch<SupplierReturn[]>(`/returns/supplier${status ? `?status=${status}` : ''}`),

  purchaseForReturn: (purchaseId: string) =>
    apiFetch<any>(`/returns/supplier/purchase/${purchaseId}`),

  createSupplier: (data: {
    purchase_id?: string | null; purchase_number?: string | null;
    supplier_id?: string | null; supplier_name?: string | null;
    reason?: string | null; resolution?: 'credit_note' | 'refund' | 'replacement';
    items: SupplierReturnItem[];
  }) => apiFetch<SupplierReturn>('/returns/supplier', { method: 'POST', body: JSON.stringify(data) }),

  settleSupplier: (id: string) =>
    apiFetch<SupplierReturn>(`/returns/supplier/${id}/settle`, { method: 'POST' }),
};

export default returnsService;
