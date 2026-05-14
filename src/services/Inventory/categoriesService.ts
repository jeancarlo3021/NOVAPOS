import { apiFetch } from '@/lib/api';

export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  icon?: string;
  created_at: string;
  updated_at: string;
}

export const categoriesService = {
  /**
   * Obtener todas las categorías del tenant
   */
  async getAllCategories(_tenantId: string): Promise<ProductCategory[]> {
    return apiFetch<ProductCategory[]>('/categories');
  },

  /**
   * Obtener una categoría por ID
   */
  async getCategoryById(categoryId: string): Promise<ProductCategory> {
    return apiFetch<ProductCategory>('/categories/' + categoryId);
  },

  /**
   * Crear categoría
   */
  async createCategory(
    _tenantId: string,
    category: Omit<ProductCategory, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
  ): Promise<ProductCategory> {
    return apiFetch<ProductCategory>('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  },

  /**
   * Actualizar categoría
   */
  async updateCategory(
    categoryId: string,
    updates: Partial<ProductCategory>
  ): Promise<ProductCategory> {
    return apiFetch<ProductCategory>('/categories/' + categoryId, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Eliminar categoría
   */
  async deleteCategory(categoryId: string): Promise<void> {
    await apiFetch('/categories/' + categoryId, { method: 'DELETE' });
  },
};
