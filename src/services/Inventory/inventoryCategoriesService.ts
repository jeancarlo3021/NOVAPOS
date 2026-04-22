import { supabase } from '@/lib/supabase';

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
  async getAllCategories(tenantId: string) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Crear categoría
  async createCategory(tenantId: string, category: Omit<InventoryCategory, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('categories')
      .insert([{ ...category, tenant_id: tenantId }])
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Actualizar categoría
  async updateCategory(id: string, updates: Partial<InventoryCategory>) {
    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  // Eliminar categoría
  async deleteCategory(id: string) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },
};