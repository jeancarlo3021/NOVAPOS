/**
 * Pre-cache essential POS data when opening a cash session
 * This ensures offline functionality for critical features
 */

import { apiFetch } from '@/lib/api';
import { cacheSet, cacheKey } from '@/utils/offlineCache';

interface CacheResult {
  products: boolean;
  promotions: boolean;
  categories: boolean;
  measurements: boolean;
  accountsPayable: boolean;
  purchases: boolean;
}

export const cashSessionCacheService = {
  /**
   * Cache all essential POS data when opening a cash session
   */
  async preCacheSessionData(tenantId: string): Promise<CacheResult> {
    const result: CacheResult = {
      products: false,
      promotions: false,
      categories: false,
      measurements: false,
      accountsPayable: false,
      purchases: false,
    };

    try {
      // Cache products in parallel with other data
      const productsCacheKey = cacheKey(tenantId, 'pos_products');
      apiFetch<any>('/products')
        .then(data => {
          cacheSet(productsCacheKey, data);
          result.products = true;
          console.log('✅ Productos cacheados:', Array.isArray(data) ? data.length : 1);
        })
        .catch(err => console.warn('⚠️ Error cacheando productos:', err.message));

      // Cache promotions
      const promotionsCacheKey = cacheKey(tenantId, 'pos_promotions');
      apiFetch<any>('/promotions')
        .then(data => {
          cacheSet(promotionsCacheKey, data);
          result.promotions = true;
          console.log('✅ Promociones cacheadas:', Array.isArray(data) ? data.length : 1);
        })
        .catch(err => console.warn('⚠️ Error cacheando promociones:', err.message));

      // Cache categories
      const categoriesCacheKey = cacheKey(tenantId, 'pos_categories');
      apiFetch<any>('/categories')
        .then(data => {
          cacheSet(categoriesCacheKey, data);
          result.categories = true;
          console.log('✅ Categorías cacheadas:', Array.isArray(data) ? data.length : 1);
        })
        .catch(err => console.warn('⚠️ Error cacheando categorías:', err.message));

      // Cache measurements (units)
      const measurementsCacheKey = cacheKey(tenantId, 'pos_measurements');
      apiFetch<any>('/unit-types')
        .then(data => {
          cacheSet(measurementsCacheKey, data);
          result.measurements = true;
          console.log('✅ Unidades de medida cacheadas:', Array.isArray(data) ? data.length : 1);
        })
        .catch(err => console.warn('⚠️ Error cacheando unidades:', err.message));

      // Cache accounts payable
      const apCacheKey = cacheKey(tenantId, 'accounts_payable_list');
      apiFetch<any>('/accounts-payable')
        .then(data => {
          cacheSet(apCacheKey, data);
          result.accountsPayable = true;
          console.log('✅ Cuentas por pagar cacheadas:', Array.isArray(data) ? data.length : 1);
        })
        .catch(err => console.warn('⚠️ Error cacheando cuentas por pagar:', err.message));

      // Cache purchases
      const purchasesCacheKey = cacheKey(tenantId, 'purchases_list');
      apiFetch<any>('/purchases')
        .then(data => {
          cacheSet(purchasesCacheKey, data);
          result.purchases = true;
          console.log('✅ Órdenes de compra cacheadas:', Array.isArray(data) ? data.length : 1);
        })
        .catch(err => console.warn('⚠️ Error cacheando órdenes de compra:', err.message));

      console.log('🔄 Pre-cacheando datos de sesión de caja...');
      return result;
    } catch (error) {
      console.error('❌ Error en pre-cacheo:', error);
      return result;
    }
  },

  /**
   * Check if all essential data is cached
   */
  async checkCacheStatus(tenantId: string): Promise<CacheResult> {
    const result: CacheResult = {
      products: false,
      promotions: false,
      categories: false,
      measurements: false,
      accountsPayable: false,
      purchases: false,
    };

    const productsCacheKey = cacheKey(tenantId, 'pos_products');
    const promotionsCacheKey = cacheKey(tenantId, 'pos_promotions');
    const categoriesCacheKey = cacheKey(tenantId, 'pos_categories');
    const measurementsCacheKey = cacheKey(tenantId, 'pos_measurements');
    const apCacheKey = cacheKey(tenantId, 'accounts_payable_list');
    const purchasesCacheKey = cacheKey(tenantId, 'purchases_list');

    result.products = !!localStorage.getItem(`novapos_cache_${productsCacheKey}`);
    result.promotions = !!localStorage.getItem(`novapos_cache_${promotionsCacheKey}`);
    result.categories = !!localStorage.getItem(`novapos_cache_${categoriesCacheKey}`);
    result.measurements = !!localStorage.getItem(`novapos_cache_${measurementsCacheKey}`);
    result.accountsPayable = !!localStorage.getItem(`novapos_cache_${apCacheKey}`);
    result.purchases = !!localStorage.getItem(`novapos_cache_${purchasesCacheKey}`);

    return result;
  },
};
