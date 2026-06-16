import { useState, useEffect, useRef, useCallback } from 'react';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { cacheGet, cacheSet, cacheKey } from '@/utils/offlineCache';
import type { Product } from '@/types/Types_POS';

interface UseInventoryProductsResult {
  products: Product[];
  loading: boolean;          // true SOLO en primera carga sin cache
  refreshing: boolean;       // true cuando hay cache visible y se está refrescando
  error: string | null;
  fromCache: boolean;        // se está mostrando data del cache
  refresh: () => Promise<void>;
}

/**
 * Hook compartido para el módulo Inventario.
 *
 * Estrategia stale-while-revalidate:
 *  1. Hidrata estado al instante con el cache `global_products` que el login
 *     pre-cargó. Si existe → loading=false desde el primer render.
 *  2. Dispara fetch al backend en segundo plano para refrescar.
 *  3. Si la red falla pero hay cache, el usuario sigue viendo data.
 *
 * Resultado: el primer render del módulo inventario es instantáneo después
 * del primer login, sin spinner ni espera al backend.
 */
export function useInventoryProducts(tenantId?: string | null): UseInventoryProductsResult {
  // ── Cargar cache de inmediato (lazy initializer evita re-leer en cada render).
  const ckGlobal = tenantId ? cacheKey(tenantId, 'global_products') : null;
  const ckLegacy = tenantId ? cacheKey(tenantId, 'products_list')   : null;

  const initial = (): Product[] => {
    if (!ckGlobal) return [];
    return cacheGet<Product[]>(ckGlobal)
        ?? (ckLegacy ? cacheGet<Product[]>(ckLegacy) : null)
        ?? [];
  };

  const [products, setProducts]     = useState<Product[]>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const fromCacheRef = useRef<boolean>(products.length > 0);
  const isMountedRef = useRef(true);

  // Solo es "loading bloqueante" si NO hay cache.
  const loading = !fromCacheRef.current && refreshing;

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await inventoryProductsService.getAllProducts(tenantId);
      if (!isMountedRef.current) return;
      const arr = Array.isArray(data) ? data : [];
      setProducts(arr);
      if (ckGlobal) cacheSet(ckGlobal, arr);
      fromCacheRef.current = false;
    } catch (e) {
      if (!isMountedRef.current) return;
      // No tiramos error si seguimos mostrando cache válido.
      if (products.length === 0) {
        setError(e instanceof Error ? e.message : 'Error al cargar productos');
      }
    } finally {
      if (isMountedRef.current) setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    isMountedRef.current = true;
    // Si cambia el tenant, re-hidratar desde su cache.
    setProducts(initial());
    fromCacheRef.current = (initial().length > 0);
    if (tenantId && navigator.onLine) refresh();
    return () => { isMountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Recargar cuando otra vista (ej. recepción de compra) actualiza el stock.
  useEffect(() => {
    const onInventoryUpdated = () => { if (tenantId) refresh(); };
    window.addEventListener('inventory-updated', onInventoryUpdated);
    return () => window.removeEventListener('inventory-updated', onInventoryUpdated);
  }, [tenantId, refresh]);

  return {
    products,
    loading,
    refreshing,
    error,
    fromCache: fromCacheRef.current && products.length > 0,
    refresh,
  };
}
