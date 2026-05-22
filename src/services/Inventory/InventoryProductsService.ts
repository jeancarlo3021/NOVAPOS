import { apiFetch } from '@/lib/api';
import { Product } from '@/types/Types_POS';

// ============================================
// CONFIGURACIÓN
// ============================================

const QUERY_TIMEOUT = 15000; // 15 segundos
const MAX_RETRIES = 3;
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
      return await withTimeout(fn(), QUERY_TIMEOUT);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

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

export async function getAllProducts(_tenantId: string | null | undefined): Promise<Product[]> {
  if (!_tenantId) return [];

  return withRetry(async () => {
    try {
      const data = await apiFetch<Product[]>('/products');
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });
}

// ============================================
// GET PRODUCT BY ID
// ============================================

export async function getProductById(
  productId: string,
  _tenantId: string
): Promise<Product | null> {

  return withRetry(async () => {
    try {
      const data = await apiFetch<Product>('/products/' + productId);
      if (data) {
      }
      return data ?? null;
    } catch (error) {
      throw error;
    }
  });
}

// ============================================
// SEARCH PRODUCTS
// ============================================

export async function searchProducts(
  _tenantId: string,
  searchTerm: string
): Promise<Product[]> {

  return withRetry(async () => {
    try {
      const params = new URLSearchParams({ search: searchTerm });
      const data = await apiFetch<Product[]>(`/products?${params}`);
      return data;
    } catch (error) {
      throw error;
    }
  });
}

// ============================================
// CREATE PRODUCT
// ============================================

export async function createProduct(
  _tenantId: string,
  productData: Omit<Product, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
): Promise<Product> {
  return withRetry(async () => {
    return apiFetch<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
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
    return apiFetch<Product>('/products/' + productId, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  });
}

// ============================================
// DELETE PRODUCT
// ============================================

export async function deleteProduct(productId: string): Promise<void> {
  return withRetry(async () => {
    await apiFetch('/products/' + productId, { method: 'DELETE' });
  });
}

// ============================================
// UPDATE STOCK
// ============================================

export async function updateStock(productId: string, newQuantity: number): Promise<void> {
  return withRetry(async () => {
    await apiFetch('/products/' + productId, {
      method: 'PUT',
      body: JSON.stringify({ stock_quantity: newQuantity }),
    });
  });
}

// ============================================
// GET INVENTORY STATS
// ============================================

export async function getInventoryStats(
  _tenantId: string | null | undefined
): Promise<{ totalProducts: number; totalValue: number; totalCost: number }> {
  if (!_tenantId) return { totalProducts: 0, totalValue: 0, totalCost: 0 };

  return withRetry(async () => {
    const products = await apiFetch<Array<{ unit_price?: number; cost_price?: number; stock_quantity?: number }>>('/products');
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

export async function getLowStockProducts(_tenantId: string | null | undefined): Promise<Product[]> {
  if (!_tenantId) return [];

  return withRetry(async () => {
    const products = await apiFetch<Product[]>('/products');
    return products.filter(
      (p) => (p.stock_quantity ?? 0) <= (p.min_stock_level ?? 0)
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
