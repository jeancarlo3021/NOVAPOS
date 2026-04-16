import { supabase } from '@/lib/supabase';

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface UnitType {
  id: string;
  tenant_id: string;
  name: string;
  abbreviation: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryProduct {
  id: string;
  tenant_id: string;
  category_id: string;
  unit_type_id: string;
  sku: string;
  name: string;
  description?: string;
  unit_price: number;
  cost_price?: number;
  stock_quantity: number;
  min_stock_level: number;
  max_stock_level?: number;
  created_at: string;
  updated_at: string;
  // Relaciones (populated)
  category?: Category;
  unit_type?: UnitType;
}

// ============================================
// CATEGORÍAS SERVICE
// ============================================

export const categoriesService = {
  // Obtener todas las categorías
  async getAllCategories(tenantId: string) {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Crear categoría
  async createCategory(tenantId: string, category: Omit<Category, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('product_categories')
      .insert([{ ...category, tenant_id: tenantId }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Actualizar categoría
  async updateCategory(id: string, updates: Partial<Category>) {
    const { data, error } = await supabase
      .from('product_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Eliminar categoría
  async deleteCategory(id: string) {
    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },
};

// ============================================
// TIPOS DE UNIDAD SERVICE
// ============================================

export const unitTypesService = {
  // Obtener todos los tipos de unidad
  async getAllUnitTypes(tenantId: string) {
    const { data, error } = await supabase
      .from('unit_types')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Crear tipo de unidad
  async createUnitType(tenantId: string, unitType: Omit<UnitType, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('unit_types')
      .insert([{ ...unitType, tenant_id: tenantId }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Actualizar tipo de unidad
  async updateUnitType(id: string, updates: Partial<UnitType>) {
    const { data, error } = await supabase
      .from('unit_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Eliminar tipo de unidad
  async deleteUnitType(id: string) {
    const { error } = await supabase
      .from('unit_types')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },
};

// ============================================
// PRODUCTOS SERVICE
// ============================================

export const inventoryProductsService = {
  // Obtener todos los productos con relaciones
  async getAllProducts(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Obtener producto por ID
  async getProductById(id: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color, description),
        unit_type:unit_type_id(id, name, abbreviation, description)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Obtener productos por categoría
  async getProductsByCategory(tenantId: string, categoryId: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId)
      .eq('category_id', categoryId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Crear producto
  async createProduct(
    tenantId: string,
    product: Omit<InventoryProduct, 'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'category' | 'unit_type'>
  ) {
    const { data, error } = await supabase
      .from('products')
      .insert([{ ...product, tenant_id: tenantId }])
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
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
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Actualizar cantidad en stock
  async updateStock(id: string, quantity: number) {
    const { data, error } = await supabase
      .from('products')
      .update({ stock_quantity: quantity, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Ajustar stock (suma o resta)
  async adjustStock(id: string, adjustment: number) {
    // Obtener stock actual
    const product = await this.getProductById(id);
    const newQuantity = (product.stock_quantity || 0) + adjustment;
    
    return this.updateStock(id, Math.max(0, newQuantity));
  },

  // Obtener productos con stock bajo
  async getLowStockProducts(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId);
    
    if (error) throw error;
    
    // Filtrar productos con stock bajo
    return (data || []).filter(product => 
      product.stock_quantity < product.min_stock_level
    );
  },

  // Obtener productos con stock crítico (muy bajo)
  async getCriticalStockProducts(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId);
    
    if (error) throw error;
    
    // Filtrar productos con stock crítico (menor a 50% del mínimo)
    return (data || []).filter(product => 
      product.stock_quantity < (product.min_stock_level * 0.5)
    );
  },

  // Buscar productos
  async searchProducts(tenantId: string, query: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId)
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%,description.ilike.%${query}%`);
    
    if (error) throw error;
    return data || [];
  },

  // Obtener estadísticas de inventario
  async getInventoryStats(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('stock_quantity, unit_price, cost_price, min_stock_level, max_stock_level')
      .eq('tenant_id', tenantId);
    
    if (error) throw error;

    const totalProducts = data?.length || 0;
    const totalValue = data?.reduce((sum, p) => 
      sum + (p.stock_quantity * p.unit_price), 0) || 0;
    const totalCost = data?.reduce((sum, p) => 
      sum + (p.stock_quantity * (p.cost_price || 0)), 0) || 0;
    const lowStockCount = data?.filter(p => 
      p.stock_quantity < p.min_stock_level).length || 0;
    const criticalStockCount = data?.filter(p => 
      p.stock_quantity < (p.min_stock_level * 0.5)).length || 0;
    const totalStock = data?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0;

    return {
      totalProducts,
      totalValue,
      totalCost,
      lowStockCount,
      criticalStockCount,
      totalStock,
      averageValue: totalProducts > 0 ? totalValue / totalProducts : 0,
      profit: totalValue - totalCost,
    };
  },

  // Obtener productos por rango de precio
  async getProductsByPriceRange(tenantId: string, minPrice: number, maxPrice: number) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId)
      .gte('unit_price', minPrice)
      .lte('unit_price', maxPrice)
      .order('unit_price', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Eliminar producto
  async deleteProduct(id: string) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Obtener productos agrupados por categoría
  async getProductsGroupedByCategory(tenantId: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id(id, name, color),
        unit_type:unit_type_id(id, name, abbreviation)
      `)
      .eq('tenant_id', tenantId)
      .order('category_id', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) throw error;

    // Agrupar por categoría
    const grouped = (data || []).reduce((acc, product) => {
      const categoryId = product.category_id;
      if (!acc[categoryId]) {
        acc[categoryId] = {
          category: product.category,
          products: [],
        };
      }
      acc[categoryId].products.push(product);
      return acc;
    }, {} as Record<string, { category: Category; products: InventoryProduct[] }>);

    return Object.values(grouped);
  },
};