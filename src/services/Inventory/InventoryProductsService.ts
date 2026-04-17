import { supabase } from '@/lib/supabase';
import { Product } from '@/types/Types_POS';

// ============================================
// CONFIGURACIÓN
// ============================================

const QUERY_TIMEOUT = 10000; // 10 segundos
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// ============================================
// HELPER: Timeout
// ============================================

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout después de ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

// ============================================
// HELPER: Retry
// ============================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔄 Intento ${i + 1}/${maxRetries}...`);
      return await withTimeout(fn(), QUERY_TIMEOUT);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️ Intento ${i + 1} falló:`, lastError.message);

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  throw lastError || new Error('Todos los intentos fallaron');
}

// ============================================
// GET ALL PRODUCTS
// ============================================

export async function getAllProducts(tenantId: string): Promise<Product[]> {
  console.log('📦 Cargando productos...');
  console.log('Tenant ID:', tenantId);

  return withRetry(async () => {
    try {
      console.log('🔍 Ejecutando query de productos...');

      const { data, error, status } = await supabase
        .from('products')
        .select(
          `
          id,
          name,
          sku,
          unit_price,
          stock_quantity,
          category_id,
          category:category_id (id, name),
          unit_type_id,
          unit_type:unit_type_id (id, name, abbreviation)
        `
        )
        .eq('tenant_id', tenantId);

      console.log('📊 Response status:', status);

      if (error) {
        console.error('❌ Error de Supabase:', error);
        throw error;
      }

      if (data) {
        console.log(`✅ ${data.length} productos encontrados`);
      } else {
        console.log('ℹ️ No hay productos');
      }

      return (data || []) as Product[];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ Error:', msg);
      throw error;
    }
  });
}

// ============================================
// GET PRODUCT BY ID
// ============================================

export async function getProductById(
  productId: string,
  tenantId: string
): Promise<Product | null> {
  console.log('📦 Cargando producto:', productId);

  return withRetry(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          id,
          name,
          sku,
          unit_price,
          stock_quantity,
          category_id,
          category:category_id (id, name),
          unit_type_id,
          unit_type:unit_type_id (id, name, abbreviation)
        `
        )
        .eq('id', productId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log('✅ Producto encontrado:', data.id);
      }

      return data as Product | null;
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  });
}

// ============================================
// SEARCH PRODUCTS
// ============================================

export async function searchProducts(
  tenantId: string,
  searchTerm: string
): Promise<Product[]> {
  console.log('🔍 Buscando productos:', searchTerm);

  return withRetry(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          id,
          name,
          sku,
          unit_price,
          stock_quantity,
          category_id,
          category:category_id (id, name),
          unit_type_id,
          unit_type:unit_type_id (id, name, abbreviation)
        `
        )
        .eq('tenant_id', tenantId)
        .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`);

      if (error) throw error;

      console.log(`✅ ${data?.length || 0} productos encontrados`);
      return (data || []) as Product[];
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  });
}

// ============================================
// CREATE PRODUCT
// ============================================

export async function createProduct(
  tenantId: string,
  productData: Omit<Product, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
): Promise<Product> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('products')
      .insert([{ tenant_id: tenantId, ...productData }])
      .select()
      .single();

    if (error) throw error;
    return data as Product;
  });
}

// ============================================
// UPDATE PRODUCT
// ============================================

export async function updateProduct(
  productId: string,
  updates: Partial<Omit<Product, 'id' | 'tenant_id' | 'created_at'>>
): Promise<Product> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;
    return data as Product;
  });
}

// ============================================
// DELETE PRODUCT
// ============================================

export async function deleteProduct(productId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;
  });
}

// ============================================
// UPDATE STOCK
// ============================================

export async function updateStock(productId: string, newQuantity: number): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('products')
      .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (error) throw error;
  });
}

// ============================================
// GET INVENTORY STATS
// ============================================

export async function getInventoryStats(
  tenantId: string
): Promise<{ totalProducts: number; totalValue: number; totalCost: number }> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('unit_price, cost_price, stock_quantity')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    const products = data || [];
    return {
      totalProducts: products.length,
      totalValue: products.reduce(
        (sum, p) => sum + (p.unit_price || 0) * (p.stock_quantity || 0),
        0
      ),
      totalCost: products.reduce(
        (sum, p) => sum + (p.cost_price || 0) * (p.stock_quantity || 0),
        0
      ),
    };
  });
}

// ============================================
// GET LOW STOCK PRODUCTS
// ============================================

export async function getLowStockProducts(tenantId: string): Promise<Product[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .filter('stock_quantity', 'lte', 'min_stock_level');

    if (error) throw error;

    // Filter in JS since Supabase column-to-column comparison requires raw SQL
    const products = (data || []) as Product[];
    return products.filter(
      (p) => p.stock_quantity <= (p.min_stock_level ?? 0)
    );
  });
}

// ============================================
// EXPORT SERVICE
// ============================================

export const inventoryProductsService = {
  getAllProducts,
  getProductById,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  getInventoryStats,
  getLowStockProducts,
};

// ============================================
// RE-EXPORT SERVICES
// ============================================

export { categoriesService } from './categoriesService';
export { unitTypesService } from './unitTypesService';

export default inventoryProductsService;