import { useState, useEffect, useMemo } from 'react';
import { Product } from '@/types/Types_POS';
import { apiFetch } from '@/lib/api';
import { useTenant } from '../useTenant';
import { posOfflineService } from '@/services/pos/posOfflineService';
import { fuzzyMatch } from '@/utils/fuzzySearch';

/**
 * Catálogo del POS.
 *
 * `recipesOnly` lo usa SOLO la ventanita: ahí lo que se vende son platos, no
 * insumos. La caja normal («Vender») sigue con el catálogo de productos, que es
 * como está funcionando en producción.
 */
export function usePOSProducts(recipesOnly = false) {
  const { tenantId } = useTenant();
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [fromCache, setFromCache]   = useState(false);
  const [cachedAt, setCachedAt]     = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // ── Fetch from API and persist to IndexedDB ────────────────────────────────

  const fetchFromNetwork = async (_tid: string, since?: string | null): Promise<Product[]> => {
    // Trae productos + unit-types + categorías en paralelo y hace JOIN en frontend.
    // Si el backend ya manda el JOIN embebido, esto solo refuerza/normaliza
    // los datos para que el caché siempre tenga las relaciones disponibles.
    //
    // El catálogo del POS son los PRODUCTOS, siempre.
    //
    // Solo la VENTANITA vende recetas, y lo pide explícitamente con
    // `recipesOnly`. Vender y ventanita son dos cosas distintas: la primera es
    // la caja de siempre —que ya está en producción vendiendo el catálogo
    // completo— y la segunda es un mostrador de comidas. Cambiarle el catálogo
    // a la caja normal porque el negocio activó recetas sería moverle el piso a
    // algo que funciona.
    const [base, menu, unitTypes, categories] = await Promise.all([
      recipesOnly
        ? Promise.resolve([] as any[])
        : apiFetch<any[]>(since ? `/products?since=${encodeURIComponent(since)}` : '/products'),
      recipesOnly ? apiFetch<any[]>('/recipes/menu').catch(() => [] as any[]) : Promise.resolve([] as any[]),
      apiFetch<any[]>('/unit-types').catch(() => []),
      apiFetch<any[]>('/categories').catch(() => []),
    ]);
    // La ventanita muestra RECETAS y nada más. Antes caía al catálogo cuando el
    // menú venía vacío, y eso hacía imposible entender qué estaba pasando: se
    // veían productos en una pantalla que dice vender platos. Vacío es vacío, y
    // la pantalla explica qué falta hacer.
    const products = recipesOnly ? menu : base;

    const unitTypeMap = Object.fromEntries(
      (unitTypes ?? []).map(ut => [ut.id, ut]),
    );
    const categoryMap = Object.fromEntries(
      (categories ?? []).map(c => [c.id, { id: c.id, name: c.name }]),
    );

    return products.map(p => ({
      ...p,
      // Respeta el join si ya viene del backend; si no, lo arma localmente.
      unit_type: p.unit_type
        ?? (p.unit_type_id ? unitTypeMap[p.unit_type_id] : null)
        ?? null,
      category: p.category
        ?? (p.category_id ? categoryMap[p.category_id] : null)
        ?? null,
    }));
  };

  // ── Load from IndexedDB cache or global localStorage cache ──────────────────────────────────────────────

  const loadFromCache = async (tid: string): Promise<{ products: Product[]; cachedAt: Date | null }> => {
    // First try global localStorage cache (from globalCacheService)
    try {
      const globalCached = localStorage.getItem(`novapos_cache_${tid}_global_products`);
      if (globalCached) {
        const data = JSON.parse(globalCached);
        const items = data.data || data;
        if (Array.isArray(items) && items.length > 0) {
          console.log('[usePOSProducts] Loaded from global cache (localStorage):', items.length, 'products');
          return { products: items, cachedAt: new Date() };
        }
      }
    } catch (e) {
    }

    // Fallback to IndexedDB cache
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
      req.onerror = () => {
        resolve({ products: [], cachedAt: null });
      };
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

  /**
   * Hasta dónde se sincronizó el catálogo (marca de agua).
   *
   * Se guarda la MAYOR fecha de modificación recibida, no la hora del aparato:
   * las tablets del negocio suelen tener la hora corrida y bastan unos minutos
   * de diferencia para saltarse cambios y no enterarse nunca de un precio nuevo.
   */
  const waterMarkKey = (tid: string) => `novapos_products_since_${tid}`;
  const getWaterMark = (tid: string): string | null => {
    try { return localStorage.getItem(waterMarkKey(tid)); } catch { return null; }
  };
  const setWaterMark = (tid: string, rows: any[]) => {
    let max = '';
    for (const r of rows) {
      const u = String(r?.updated_at ?? '');
      if (u > max) max = u;
    }
    if (!max) return;
    try {
      const previo = getWaterMark(tid) ?? '';
      if (max > previo) localStorage.setItem(waterMarkKey(tid), max);
    } catch { /* sin storage: se sigue pidiendo todo, funciona igual */ }
  };

  /**
   * Mezcla los cambios con lo que ya había.
   *
   * Los borrados llegan con `deleted_at` y salen del catálogo; si se ignoraran,
   * un producto eliminado seguiría vendiéndose desde el aparato para siempre.
   */
  const fusionar = (previos: Product[], cambios: any[]): Product[] => {
    if (!cambios.length) return previos;
    const porId = new Map(previos.map(p => [String((p as any).id), p]));
    for (const c of cambios) {
      const id = String(c?.id ?? '');
      if (!id) continue;
      if (c.deleted_at) porId.delete(id);
      else porId.set(id, c);
    }
    return Array.from(porId.values())
      .sort((a: any, b: any) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));
  };

  // ── Main load logic ────────────────────────────────────────────────────────

  const load = async (tid: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    // Try network first when online
    if (navigator.onLine) {
      try {
        /**
         * Solo lo que cambió, si ya hay catálogo guardado.
         *
         * Antes se bajaban los 3.000 productos completos en CADA arranque para
         * casi siempre descubrir que no había cambiado nada. Con la marca de
         * agua, el arranque normal trae cero filas.
         */
        const marca = recipesOnly ? null : getWaterMark(tid);
        const previos = marca ? (await loadFromCache(tid)).products : [];
        // La marca sin catálogo guardado no sirve para nada: se pide todo.
        const incremental = !!marca && previos.length > 0;

        const cambios = await fetchFromNetwork(tid, incremental ? marca : null);
        const fetched = incremental ? fusionar(previos, cambios) : cambios;
        if (!recipesOnly) setWaterMark(tid, cambios);
        console.log('[usePOSProducts] Catálogo:', {
          recibidos: cambios.length,
          incremental,
          count: fetched.length,
          firstProduct: fetched[0] ? JSON.stringify(fetched[0], null, 2) : 'none',
          sample: fetched.slice(0, 2).map(p => ({
            id: p.id,
            name: p.name,
            unit_type_id: (p as any).unit_type_id,
            unit_type: (p as any).unit_type,
          }))
        });
        setProducts(fetched);
        setFromCache(false);
        setCachedAt(new Date());
        // El caché es UNO por empresa y lo comparten la caja y la ventanita, así
        // que solo escribe la caja: si la ventanita guardara su menú de recetas
        // ahí, al abrir «Vender» sin conexión aparecerían platos en vez del
        // catálogo. Sin conexión la ventanita cae a ese mismo caché, que es de
        // productos — de más, pero nunca vacío.
        if (!recipesOnly) {
          saveToCache(tid, fetched).catch(() => {});
          posOfflineService.cacheProducts(tid, fetched).catch(() => {});
        }
        setLoading(false);
        return;
      } catch (err) {
        // Network failed even though online — fall through to cache
      }
    }

    // Sin conexión, la ventanita NO cae al caché: ese caché es de productos y
    // llenaría de insumos una pantalla que vende platos. Prefiere quedarse
    // vacía y decirlo.
    if (recipesOnly) {
      setProducts([]);
      setError('Sin conexión: el menú de recetas necesita internet para cargarse.');
      setLoading(false);
      return;
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
    // Búsqueda por similitud (tolerante a errores) sobre nombre, SKU, SKU2 y desc.
    return products.filter(p =>
      fuzzyMatch(searchTerm, p.name, p.sku, (p as any).sku2, p.description)
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
