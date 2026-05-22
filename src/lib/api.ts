import { supabase } from './supabase';
import { offlineQueue } from '@/services/offlineQueue';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function getToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('[getToken] Error getting session:', error);
      return null;
    }

    if (!data.session?.access_token) {
      console.warn('[getToken] No access token available');
      return null;
    }

    // Check if token is expiring soon (within 5 minutes)
    const expiresAt = data.session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const secondsUntilExpiry = (expiresAt ?? 0) - now;

    if (secondsUntilExpiry < 300 && data.session.refresh_token) {
      console.log('[getToken] Token expiring soon, attempting refresh...');

      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        console.warn('[getToken] Refresh failed:', refreshError);
        return data.session.access_token;
      }

      if (refreshedData.session?.access_token) {
        console.log('[getToken] Token refreshed successfully');
        return refreshedData.session.access_token;
      }
    }

    return data.session.access_token;
  } catch (err) {
    console.error('[getToken] Unexpected error:', err);
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<T> {
  // Validate path doesn't contain undefined
  if (path.includes('undefined')) {
    const error = `Invalid API path with undefined: ${path}`;
    console.error('[API] ❌', error);
    throw new Error(error);
  }

  const token = await getToken();
  const method = (options.method || 'GET').toUpperCase();
  const isGetRequest = method === 'GET';
  const isOffline = !navigator.onLine;

  console.log(`[API] ${isOffline ? '📱 OFFLINE' : '🌐 ONLINE'} - ${method} ${path}`);

  // Handle offline requests
  if (isOffline) {
    // GET requests: try cache
    if (isGetRequest) {
      console.log('[API] Intentando usar datos cacheados para:', path);

      const cacheKeyMap: Record<string, string> = {
        '/products': 'global_products',
        '/categories': 'global_categories',
        '/unit-types': 'global_measurements',
        '/promotions/active': 'active_promotions',
        '/promotions': 'global_promotions',
        '/suppliers': 'global_suppliers',
        '/purchases': 'global_purchases',
        '/accounts-payable': 'global_accounts_payable',
        '/expenses': 'global_expenses',
        '/users': 'global_users',
        '/teams': 'global_teams',
      };

      // Strip query parameters for cache key lookup
      const pathBase = path.split('?')[0];
      const cacheKey = cacheKeyMap[pathBase];
      if (cacheKey) {
        const cached = localStorage.getItem(`novapos_cache_${cacheKey}`);
        if (cached) {
          try {
            const data = JSON.parse(cached);
            const items = data.data || data;
            console.log('[API] ✅ Usando datos cacheados:', path);
            return items as T;
          } catch (e) {
            console.warn('[API] Error parseando caché:', e);
          }
        }
      }

      throw new Error(`Sin conexión y sin datos cacheados para ${path}`);
    }

    // POST/PUT/DELETE: enqueue operation
    console.log(`[API] Encolando operación offline: ${method} ${path}`);
    const body = options.body ? JSON.parse(options.body as string) : undefined;
    await offlineQueue.enqueue(path, method, body);

    // Return optimistic response
    return {
      id: `pending_${Date.now()}`,
      status: 'pending',
      message: 'Pendiente de sincronización',
    } as unknown as T;
  }

  // Online: make normal request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    }

    if (!res.ok) {
      const errorMsg = body?.error || body?.message || `HTTP ${res.status}`;
      console.error(`[API] ${method} ${path} → Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`[API] ✅ ${method} ${path}`);
    return body.data as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[API] ❌ ${method} ${path}: ${errorMsg}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
