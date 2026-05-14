/**
 * Simple localStorage cache for offline fallback.
 * Keys are scoped by tenantId so different tenants don't share data.
 * Cached values include a timestamp so stale data can be detected.
 */

const PREFIX = 'novapos_cache_';

interface CacheEntry<T> { data: T; cachedAt: number }

export function cacheSet<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch { /* storage full or unavailable — ignore */ }
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return entry.data;
  } catch { return null; }
}

export function cacheKey(tenantId: string | null | undefined, resource: string): string {
  return `${tenantId ?? 'local'}_${resource}`;
}

/**
 * Fetch with automatic cache-on-success and fallback-on-offline.
 * Returns { data, fromCache }.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; fromCache: boolean }> {
  if (navigator.onLine) {
    try {
      const data = await fetcher();
      cacheSet(key, data);
      return { data, fromCache: false };
    } catch {
      const cached = cacheGet<T>(key);
      if (cached !== null) return { data: cached, fromCache: true };
      return { data: fallback, fromCache: false };
    }
  }
  const cached = cacheGet<T>(key);
  if (cached !== null) return { data: cached, fromCache: true };
  return { data: fallback, fromCache: false };
}
