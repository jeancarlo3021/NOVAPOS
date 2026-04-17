import { supabase } from '@/lib/supabase';

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
  async getAllCategories(tenantId: string): Promise<ProductCategory[]> {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener una categoría por ID
   */
  async getCategoryById(categoryId: string): Promise<ProductCategory> {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('id', categoryId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crear categoría
   */
  async createCategory(
    tenantId: string,
    category: Omit<ProductCategory, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
  ): Promise<ProductCategory> {
    const { data, error } = await supabase
      .from('product_categories')
      .insert([
        {
          tenant_id: tenantId,
          ...category,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Actualizar categoría
   */
  async updateCategory(
    categoryId: string,
    updates: Partial<ProductCategory>
  ): Promise<ProductCategory> {
    const { data, error } = await supabase
      .from('product_categories')
      .update(updates)
      .eq('id', categoryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Eliminar categoría
   */
  async deleteCategory(categoryId: string): Promise<void> {
    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', categoryId);

    if (error) throw error;
  },
};