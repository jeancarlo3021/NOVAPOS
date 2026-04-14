import { supabase } from '@/lib/supabase';

export interface InventoryProduct {
  id: string;
  tenant_id: string;
  category: string;
  sku: string;
  name: string;
  description?: string;
  unit_price: number;
  cost_price?: number;
  stock_quantity: number;
  min_stock_level: number;
  max_quantity?: number;
  created_at: string;
  updated_at: string;
}

export const inventoryProductsService = {
  // Obtener todos los productos
  async getAllProducts(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Obtener producto por ID
  async getProductById(id: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Obtener productos por categoría
  async getProductsByCategory(tenantId: string, category: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('category', category);
    
    if (error) throw error;
    return data || [];
  },

  // Crear producto
  async createProduct(tenantId: string, product: Omit<InventoryProduct, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('products')
      .insert([{ ...product, tenant_id: tenantId }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Actualizar producto
  async updateProduct(id: string, updates: Partial<InventoryProduct>) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Actualizar cantidad en stock
  async updateStock(id: string, quantity: number) {
    const { data, error } = await supabase
      .from('products')
      .update({ stock_quantity: quantity })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Obtener productos con stock bajo
  async getLowStockProducts(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId);
    
    if (error) throw error;
    
    // Filtrar en el cliente (comparación de dos columnas)
    return (data || []).filter(product => 
      product.stock_quantity < product.min_stock_level
    );
  },

  // Buscar productos
  async searchProducts(tenantId: string, query: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%`);
    
    if (error) throw error;
    return data || [];
  },

  // Obtener estadísticas de inventario
  async getInventoryStats(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('stock_quantity, unit_price, cost_price, min_stock_level')
      .eq('tenant_id', tenantId);
    
    if (error) throw error;

    const totalProducts = data?.length || 0;
    const totalValue = data?.reduce((sum, p) => 
      sum + (p.stock_quantity * p.unit_price), 0) || 0;
    const totalCost = data?.reduce((sum, p) => 
      sum + (p.stock_quantity * (p.cost_price || 0)), 0) || 0;
    const lowStockCount = data?.filter(p => 
      p.stock_quantity < p.min_stock_level).length || 0;

    const stats = {
      totalProducts,
      totalValue,
      totalCost,
      lowStockCount,
      averageValue: totalProducts > 0 ? totalValue / totalProducts : 0,
    };

    return stats;
  },
};