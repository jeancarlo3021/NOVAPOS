import { supabase } from '@/lib/supabase';

export const categoriesService = {
  // Obtener todas las categorías del usuario
  async getCategories(userId: string) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Crear categoría
  async createCategory(userId: string, category: any) {
    const { data, error } = await supabase
      .from('categories')
      .insert([
        {
          user_id: userId,
          ...category,
        },
      ])
      .select();

    if (error) throw error;
    return data[0];
  },

  // Actualizar categoría
  async updateCategory(categoryId: string, updates: any) {
    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', categoryId)
      .select();

    if (error) throw error;
    return data[0];
  },

  // Eliminar categoría
  async deleteCategory(categoryId: string) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (error) throw error;
  },
};
