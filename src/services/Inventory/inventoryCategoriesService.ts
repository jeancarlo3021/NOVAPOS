import { apiFetch } from '@/lib/api';

export interface InventoryCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const inventoryCategoriesService = {
  // Obtener todas las categorías
  async getAllCategories(_tenantId: string) {
    return apiFetch<InventoryCategory[]>('/categories');
  },

  // Crear categoría
  async createCategory(_tenantId: string, category: Omit<InventoryCategory, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    return apiFetch<InventoryCategory>('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  },

  // Actualizar categoría
  async updateCategory(id: string, updates: Partial<InventoryCategory>) {
    return apiFetch<InventoryCategory>('/categories/' + id, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Eliminar categoría
  async deleteCategory(id: string) {
    await apiFetch('/categories/' + id, { method: 'DELETE' });
    return true;
  },
};
