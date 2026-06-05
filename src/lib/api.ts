import { supabase } from './supabase';
import { offlineQueue } from '@/services/offlineQueue';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function getToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return null;
    }

    if (!data.session?.access_token) {
      return null;
    }

    // Check if token is expiring soon (within 5 minutes)
    const expiresAt = data.session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const secondsUntilExpiry = (expiresAt ?? 0) - now;

    if (secondsUntilExpiry < 300 && data.session.refresh_token) {

      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        return data.session.access_token;
      }

      if (refreshedData.session?.access_token) {
        return refreshedData.session.access_token;
      }
    }

    return data.session.access_token;
  } catch (err) {
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
    throw new Error(error);
  }

  const token = await getToken();
  const method = (options.method || 'GET').toUpperCase();
  const isGetRequest = method === 'GET';
  const isOffline = !navigator.onLine;


  // Handle offline requests
  if (isOffline) {
    // GET requests: try cache
    if (isGetRequest) {

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
            return items as T;
          } catch (e) {
          }
        }
      }

      throw new Error(`Sin conexión y sin datos cacheados para ${path}`);
    }

    // POST/PUT/DELETE: enqueue operation
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
    // Sucursal activa: el backend la usa para filtrar/gating cuando aplique.
    let branchId: string | null = null;
    try { branchId = localStorage.getItem('novapos_current_branch_id'); } catch { /* SSR */ }

    const res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(branchId ? { 'x-branch-id': branchId } : {}),
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
      // Detección instantánea: si el backend rechaza por tenant suspendido,
      // disparamos un evento global para que AuthContext actualice el state
      // y se muestre el modal de "Cuenta suspendida" sin esperar al próximo
      // refresh ni a la subscripción realtime.
      if (res.status === 403 && body?.code === 'tenant_suspended') {
        try {
          window.dispatchEvent(new CustomEvent('tenant-status-changed', {
            detail: { status: body.status ?? 'suspended' },
          }));
        } catch { /* SSR-safe */ }
      }

      const errorMsg = body?.error || body?.message || `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }

    return body.data as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
