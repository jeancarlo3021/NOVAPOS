import { useState, useEffect, useMemo } from 'react';
import { Product } from '@/types/Types_POS';
import { supabase } from '@/lib/supabase';
import { useTenant } from '../useTenant';

export function usePOSProducts() {
  const { tenantId } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Cargar productos
  useEffect(() => {
    const loadProducts = async () => {
      if (!tenantId) {
        console.warn('⚠️ No tenant ID disponible');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log('📦 Cargando productos para tenant:', tenantId);

        const { data, error: supabaseError } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('name', { ascending: true });

        if (supabaseError) {
          throw supabaseError;
        }

        console.log('✅ Productos cargados:', data?.length || 0);
        setProducts(data || []);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
        console.error('❌ Error cargando productos:', errorMessage);
        setError(errorMessage);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [tenantId]);

  // Filtrar productos por búsqueda
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      return products;
    }

    const term = searchTerm.toLowerCase();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term) ||
        product.description?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  return {
    products,
    filteredProducts,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    refetch: () => { setProducts([]); },
  };
}