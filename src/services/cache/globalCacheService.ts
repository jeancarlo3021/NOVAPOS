/**
 * Global cache service - Pre-caches all essential app data on login
 * Ensures full offline functionality across all pages and modules
 */

import { apiFetch } from '@/lib/api';
import { cacheSet, cacheKey } from '@/utils/offlineCache';

export interface GlobalCacheProgress {
  total: number;
  completed: number;
  currentItem: string;
  percentage: number;
}

export interface CacheStats {
  products: number;
  promotions: number;
  categories: number;
  measurements: number;
  accountsPayable: number;
  purchases: number;
  suppliers: number;
  expenses: number;
  users: number;
  timestamp: string;
}

type CacheCallback = (progress: GlobalCacheProgress) => void;

export const globalCacheService = {
  /**
   * Pre-cache all essential data on user login
   * Call this from AuthContext when user authenticates
   */
  async preCacheAllData(
    tenantId: string,
    onProgress?: CacheCallback
  ): Promise<CacheStats> {
    const stats: CacheStats = {
      products: 0,
      promotions: 0,
      categories: 0,
      measurements: 0,
      accountsPayable: 0,
      purchases: 0,
      suppliers: 0,
      expenses: 0,
      users: 0,
      timestamp: new Date().toISOString(),
    };

    const cacheTasks = [
      {
        name: 'Productos',
        key: 'global_products',
        endpoint: '/products',
        statKey: 'products' as keyof CacheStats,
      },
      {
        name: 'Promociones',
        key: 'active_promotions',
        endpoint: '/promotions/active',
        statKey: 'promotions' as keyof CacheStats,
      },
      {
        name: 'Categorías',
        key: 'global_categories',
        endpoint: '/categories',
        statKey: 'categories' as keyof CacheStats,
      },
      {
        name: 'Tipos de Medida',
        key: 'global_measurements',
        endpoint: '/unit-types',
        statKey: 'measurements' as keyof CacheStats,
      },
      {
        name: 'Cuentas por Pagar',
        key: 'global_accounts_payable',
        endpoint: '/accounts-payable',
        statKey: 'accountsPayable' as keyof CacheStats,
      },
      {
        name: 'Órdenes de Compra',
        key: 'global_purchases',
        endpoint: '/purchases',
        statKey: 'purchases' as keyof CacheStats,
      },
      {
        name: 'Proveedores',
        key: 'global_suppliers',
        endpoint: '/suppliers',
        statKey: 'suppliers' as keyof CacheStats,
      },
      {
        name: 'Gastos',
        key: 'global_expenses',
        endpoint: '/expenses',
        statKey: 'expenses' as keyof CacheStats,
      },
      {
        name: 'Usuarios',
        key: 'global_users',
        endpoint: '/users',
        statKey: 'users' as keyof CacheStats,
      },
    ];

    const total = cacheTasks.length;
    let completed = 0;

    console.log(`🔄 Iniciando pre-cacheo global para tenant ${tenantId}...`);

    // Cache all tasks in parallel for speed
    const promises = cacheTasks.map(async (task) => {
      try {
        const cacheKeyFull = cacheKey(tenantId, task.key);
        const data = await apiFetch<any>(task.endpoint);

        // Store in localStorage
        cacheSet(cacheKeyFull, data);

        // Update stats
        const count = Array.isArray(data) ? data.length : 1;
        stats[task.statKey] = count;

        completed++;
        const percentage = Math.round((completed / total) * 100);

        console.log(`✅ ${task.name}: ${count} items (${percentage}%)`);

        // Call progress callback
        if (onProgress) {
          onProgress({
            total,
            completed,
            currentItem: task.name,
            percentage,
          });
        }

        return { success: true, task: task.name };
      } catch (error) {
        console.warn(`⚠️ Error cacheando ${task.name}:`, error);
        completed++;
        const percentage = Math.round((completed / total) * 100);

        if (onProgress) {
          onProgress({
            total,
            completed,
            currentItem: task.name,
            percentage,
          });
        }

        return { success: false, task: task.name, error };
      }
    });

    // Wait for all cache tasks to complete
    await Promise.all(promises);

    console.log('✅ Pre-cacheo global completado:', stats);
    return stats;
  },

  /**
   * Get cache status - which data is cached
   */
  async getCacheStatus(tenantId: string): Promise<Partial<CacheStats>> {
    const status: Partial<CacheStats> = {};

    const keys: (keyof CacheStats)[] = [
      'products',
      'promotions',
      'categories',
      'measurements',
      'accountsPayable',
      'purchases',
      'suppliers',
      'expenses',
      'users',
    ];

    const cacheKeyMap: Record<string, string> = {
      products: 'global_products',
      promotions: 'active_promotions',
      categories: 'global_categories',
      measurements: 'global_measurements',
      accountsPayable: 'global_accounts_payable',
      purchases: 'global_purchases',
      suppliers: 'global_suppliers',
      expenses: 'global_expenses',
      users: 'global_users',
    };

    for (const key of keys) {
      const cacheKeyFull = cacheKey(tenantId, cacheKeyMap[key]);
      const data = localStorage.getItem(`novapos_cache_${cacheKeyFull}`);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          const items = parsed.data || parsed;
          status[key] = Array.isArray(items) ? items.length : 1;
        } catch {
          status[key] = 0;
        }
      } else {
        status[key] = 0;
      }
    }

    return status;
  },

  /**
   * Clear all global cache
   */
  async clearGlobalCache(tenantId: string): Promise<void> {
    const keys = [
      'global_products',
      'active_promotions',
      'global_categories',
      'global_measurements',
      'global_accounts_payable',
      'global_purchases',
      'global_suppliers',
      'global_expenses',
      'global_users',
    ];

    for (const key of keys) {
      const cacheKeyFull = cacheKey(tenantId, key);
      localStorage.removeItem(`novapos_cache_${cacheKeyFull}`);
    }

    console.log('🗑️ Cache global limpiado');
  },
};
