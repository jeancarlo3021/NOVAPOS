import { apiFetch } from '@/lib/api';

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  hacienda_branch_code?: string | null;
  is_active: boolean;
  is_default: boolean;
  is_user_default?: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  code: string;
  is_active: boolean;
  is_default: boolean;
  branch?: { id: string; name: string; code: string } | null;
  created_at: string;
}

export interface ProductStockRow {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  min_level?: number | null;
  product?: { id: string; name: string; sku?: string; unit_price?: number; min_stock_level?: number };
}

export const branchesService = {
  list:    () => apiFetch<Branch[]>('/branches'),
  mine:    () => apiFetch<Branch[]>('/branches/mine'),
  create:  (b: Partial<Branch>) => apiFetch<Branch>('/branches', { method: 'POST', body: JSON.stringify(b) }),
  update:  (id: string, b: Partial<Branch>) => apiFetch<Branch>(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove:  (id: string) => apiFetch(`/branches/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) => apiFetch(`/branches/${id}/set-default`, { method: 'POST' }),
  setUsers:   (id: string, user_ids: string[]) =>
    apiFetch(`/branches/${id}/users`, { method: 'PUT', body: JSON.stringify({ user_ids }) }),
};

export const warehousesService = {
  list:   (branchId?: string) => apiFetch<Warehouse[]>(`/warehouses${branchId ? '?branch_id=' + branchId : ''}`),
  create: (w: Partial<Warehouse>) => apiFetch<Warehouse>('/warehouses', { method: 'POST', body: JSON.stringify(w) }),
  update: (id: string, w: Partial<Warehouse>) =>
    apiFetch<Warehouse>(`/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(w) }),
  remove: (id: string) => apiFetch(`/warehouses/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) => apiFetch(`/warehouses/${id}/set-default`, { method: 'POST' }),
  stock:  (id: string) => apiFetch<ProductStockRow[]>(`/warehouses/${id}/stock`),
  setStock: (warehouseId: string, productId: string, quantity: number, min_level?: number | null) =>
    apiFetch(`/warehouses/${warehouseId}/stock/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity, min_level: min_level ?? null }),
    }),
};

export interface TransferItem {
  id?: string;
  product_id: string;
  quantity: number;
  product?: { id: string; name: string; sku?: string };
}

export interface Transfer {
  id: string;
  tenant_id: string;
  from_warehouse: string;
  to_warehouse: string;
  status: 'pending' | 'in_transit' | 'received' | 'cancelled';
  notes?: string | null;
  created_at: string;
  sent_at?: string | null;
  received_at?: string | null;
  from_wh?: { id: string; name: string; code: string; branch_id: string };
  to_wh?:   { id: string; name: string; code: string; branch_id: string };
  items?: TransferItem[];
}

export const transfersService = {
  list:    (status?: string) => apiFetch<Transfer[]>(`/transfers${status ? '?status=' + status : ''}`),
  create:  (payload: { from_warehouse: string; to_warehouse: string; notes?: string; items: { product_id: string; quantity: number }[] }) =>
    apiFetch<Transfer>('/transfers', { method: 'POST', body: JSON.stringify(payload) }),
  send:    (id: string) => apiFetch(`/transfers/${id}/send`,    { method: 'POST' }),
  receive: (id: string) => apiFetch(`/transfers/${id}/receive`, { method: 'POST' }),
  cancel:  (id: string) => apiFetch(`/transfers/${id}/cancel`,  { method: 'POST' }),
  /** Transferencia cross-sucursal: bodega del tenant actual → inventario de otra sucursal del grupo. */
  crossTenant: (payload: {
    from_warehouse: string;
    to_tenant_id:   string;
    notes?:         string;
    items:          { product_id: string; quantity: number }[];
  }) => apiFetch<{ moved: number; errors: string[]; transfer_id?: string }>('/transfers/cross-tenant', {
    method: 'POST',
    body:   JSON.stringify(payload),
  }),
};
