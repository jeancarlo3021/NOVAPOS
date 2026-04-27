import { useState, useEffect, useMemo } from 'react';
import { Product } from '@/types/Types_POS';
import { supabase } from '@/lib/supabase';
import { useTenant } from '../useTenant';
import { posOfflineService } from '@/services/pos/posOfflineService';

export function usePOSProducts() {
  const { tenantId } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadProducts = async () => {
      if (!tenantId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // 1. Try Supabase first
      if (navigator.onLine) {
        try {
          const { data, error: sbError } = await supabase
            .from('products')
            .select('*, category:product_categories(id,name), unit_type:unit_types(id,name,abbreviation,requires_weight)')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true });

          if (sbError) throw sbError;

          const fetched = (data || []) as unknown as Product[];
          setProducts(fetched);
          setFromCache(false);
          setError(null);

          // Cache for offline use
          posOfflineService.cacheProducts(tenantId, fetched).catch(() => {});
          setLoading(false);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('❌ usePOSProducts Supabase error:', msg, err);
          setError(`Error cargando productos: ${msg}`);
          setLoading(false);
          return;
        }
      }

      // 2. Offline fallback: load from IndexedDB cache
      try {
        const cached = await posOfflineService.getCachedProducts(tenantId);
        if (cached && cached.length > 0) {
          setProducts(cached);
          setFromCache(true);
          setError(null);
        } else {
          setProducts([]);
          setError('Sin conexión y sin datos en caché');
        }
      } catch (cacheErr) {
        setProducts([]);
        setError('No hay productos disponibles sin conexión');
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [tenantId]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  return {
    products,
    filteredProducts,
    loading,
    error,
    fromCache,
    searchTerm,
    setSearchTerm,
    refetch: () => {
      setLoading(true);
      setProducts([]);
    },
  };
}
