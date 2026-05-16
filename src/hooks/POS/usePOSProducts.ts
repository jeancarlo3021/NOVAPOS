import { useState, useEffect, useMemo } from 'react';
import { Product } from '@/types/Types_POS';
import { apiFetch } from '@/lib/api';
import { useTenant } from '../useTenant';
import { posOfflineService } from '@/services/pos/posOfflineService';

export function usePOSProducts() {
  const { tenantId } = useTenant();
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [fromCache, setFromCache]   = useState(false);
  const [cachedAt, setCachedAt]     = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // ── Fetch from API and persist to IndexedDB ────────────────────────────────

  const fetchFromNetwork = async (_tid: string): Promise<Product[]> => {
    return apiFetch<Product[]>('/products?include=category,unit_type&order=name');
  };

  // ── Load from IndexedDB cache ──────────────────────────────────────────────

  const loadFromCache = async (tid: string): Promise<{ products: Product[]; cachedAt: Date | null }> => {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx  = db.transaction('products_cache', 'readonly');
      const req = tx.objectStore('products_cache').get(tid);
      req.onsuccess = () => {
        const record = req.result;
        if (record?.products?.length) {
          resolve({ products: record.products, cachedAt: new Date(record.cachedAt) });
        } else {
          resolve({ products: [], cachedAt: null });
        }
      };
      req.onerror = () => resolve({ products: [], cachedAt: null });
    });
  };

  // ── Save to IndexedDB cache ────────────────────────────────────────────────

  const saveToCache = async (tid: string, prods: Product[]): Promise<void> => {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('products_cache', 'readwrite');
      const req = tx.objectStore('products_cache').put({
        tenantId: tid,
        products: prods,
        cachedAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  };

  // ── Main load logic ────────────────────────────────────────────────────────

  const load = async (tid: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    // Try network first when online
    if (navigator.onLine) {
      try {
        const fetched = await fetchFromNetwork(tid);
        setProducts(fetched);
        setFromCache(false);
        setCachedAt(new Date());
        // Persist to both cache stores
        saveToCache(tid, fetched).catch(() => {});
        posOfflineService.cacheProducts(tid, fetched).catch(() => {});
        setLoading(false);
        return;
      } catch (err) {
        // Network failed even though online — fall through to cache
        console.warn('usePOSProducts: network error, falling back to cache', err);
      }
    }

    // Offline or network error — try cache
    try {
      const { products: cached, cachedAt: ts } = await loadFromCache(tid);
      if (cached.length > 0) {
        setProducts(cached);
        setFromCache(true);
        setCachedAt(ts);
        setError(null);
      } else {
        const legacy = await posOfflineService.getCachedProducts(tid);
        if (legacy && legacy.length > 0) {
          setProducts(legacy);
          setFromCache(true);
          setCachedAt(null);
          setError(null);
        } else {
          setProducts([]);
          setError('Sin conexión y sin datos en caché. Conecta internet para cargar los productos.');
        }
      }
    } catch {
      setProducts([]);
      setError('No hay productos disponibles sin conexión.');
    } finally {
      setLoading(false);
    }
  };

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    load(tenantId);
  }, [tenantId]);

  // ── React to online/offline events ────────────────────────────────────────
  // When the browser goes offline: keep current products in memory, mark as cached.
  // When back online: silently refresh from API and update cache.

  useEffect(() => {
    if (!tenantId) return;

    const handleOffline = () => {
      if (products.length > 0) setFromCache(true);
    };

    const handleOnline = () => {
      load(tenantId, true);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, [tenantId, products.length]);

  // ── Search ─────────────────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(p =>
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
    cachedAt,
    searchTerm,
    setSearchTerm,
    refetch: () => { if (tenantId) load(tenantId); },
  };
}

// ── IndexedDB helper ──────────────────────────────────────────────────────────

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('novapos_product_cache', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('products_cache')) {
        db.createObjectStore('products_cache', { keyPath: 'tenantId' });
      }
    };
  });
}
