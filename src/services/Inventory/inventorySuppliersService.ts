import { apiFetch } from '@/lib/api';

export interface InventorySupplier {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  payment_terms: string | null;
  created_at: string;
  updated_at: string;
}

// Fields writable by the app (must match the actual DB schema columns)
export interface SupplierPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  payment_terms?: string | null;
}

export const inventorySuppliersService = {
  // Obtener todos los proveedores
  async getAllSuppliers(_tenantId: string | null | undefined) {
    if (!_tenantId) return [];
    return apiFetch<InventorySupplier[]>('/suppliers');
  },

  // Obtener proveedor por ID
  async getSupplierById(id: string) {
    return apiFetch<InventorySupplier>('/suppliers/' + id);
  },

  // Crear proveedor — only sends columns that exist in the DB schema
  async createSupplier(_tenantId: string, supplier: SupplierPayload) {
    return apiFetch<InventorySupplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        name: supplier.name,
        email: supplier.email || null,
        phone: supplier.phone || null,
        address: supplier.address || null,
        city: supplier.city || null,
        country: supplier.country || null,
        payment_terms: supplier.payment_terms || null,
      }),
    });
  },

  // Actualizar proveedor — only sends columns that exist in the DB schema
  async updateSupplier(id: string, updates: Partial<SupplierPayload>) {
    return apiFetch<InventorySupplier>('/suppliers/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        ...(updates.name       !== undefined && { name:          updates.name }),
        ...(updates.email      !== undefined && { email:         updates.email || null }),
        ...(updates.phone      !== undefined && { phone:         updates.phone || null }),
        ...(updates.address    !== undefined && { address:       updates.address || null }),
        ...(updates.city       !== undefined && { city:          updates.city || null }),
        ...(updates.country    !== undefined && { country:       updates.country || null }),
        ...(updates.payment_terms !== undefined && { payment_terms: updates.payment_terms || null }),
      }),
    });
  },

  // Desactivar proveedor (is_active no está en el schema actual — no-op)
  async deactivateSupplier(_id: string) {
    return null;
  },

  // Eliminar proveedor
  async deleteSupplier(id: string): Promise<void> {
    await apiFetch('/suppliers/' + id, { method: 'DELETE' });
  },

  // Buscar proveedores
  async searchSuppliers(_tenantId: string, query: string) {
    const params = new URLSearchParams({ search: query });
    return apiFetch<InventorySupplier[]>(`/suppliers?${params}`);
  },
};
