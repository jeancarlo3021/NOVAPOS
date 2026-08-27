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
  timeoutMs: number = 20000
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

  // ── Modo solo-lectura por morosidad ──────────────────────────────────────
  // Bloquea mutaciones SI: 1) hay token (usuario autenticado) Y 2) la flag
  // local está activa. Sin token significa login/refresh — no debemos romper.
  if (!isGetRequest && token) {
    let readOnly = false;
    try { readOnly = localStorage.getItem('novapos_read_only') === '1'; } catch { /* ignore */ }
    if (readOnly) {
      throw new Error('Cuenta en modo solo lectura — regularizá tu pago para hacer cambios.');
    }
  }


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
      const cacheBaseKey = cacheKeyMap[pathBase];
      if (cacheBaseKey) {
        // El cache global está namespaced por tenant: `novapos_cache_<tenantId>_<resource>`.
        // Probar primero con tenant actual, luego variantes legacy sin tenant, y
        // como último recurso escanear cualquier entrada que termine en el recurso.
        let tenantId: string | null = null;
        try { tenantId = localStorage.getItem('novapos_current_tenant_id'); } catch { /* SSR */ }

        const candidates: string[] = [];
        if (tenantId) candidates.push(`novapos_cache_${tenantId}_${cacheBaseKey}`);
        candidates.push(`novapos_cache_${cacheBaseKey}`);

        for (const k of candidates) {
          const cached = localStorage.getItem(k);
          if (!cached) continue;
          try {
            const data = JSON.parse(cached);
            const items = data.data ?? data;
            return items as T;
          } catch { /* siguiente candidato */ }
        }

        // Fallback: escanear cualquier key `novapos_cache_*_<cacheBaseKey>` (otro tenant local).
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith('novapos_cache_')) continue;
            if (!k.endsWith(`_${cacheBaseKey}`)) continue;
            const cached = localStorage.getItem(k);
            if (!cached) continue;
            try {
              const data = JSON.parse(cached);
              const items = data.data ?? data;
              return items as T;
            } catch { /* siguiente */ }
          }
        } catch { /* SSR / acceso denegado */ }
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
    // Terminal (caja) de ESTE equipo. Solo se manda si NO es la 1 (la de por
    // defecto), para no cambiarle el consecutivo a quien nunca configuró nada.
    let terminalNo = 0;
    try {
      const n = parseInt(localStorage.getItem('novapos_terminal') ?? '', 10);
      terminalNo = Number.isFinite(n) && n > 1 ? n : 0;
    } catch { /* SSR */ }

    const res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(branchId ? { 'x-branch-id': branchId } : {}),
        // El backend la usa para armar el consecutivo de Hacienda: dos equipos
        // facturando a la vez generan consecutivos distintos.
        ...(terminalNo ? { 'x-terminal': String(terminalNo) } : {}),
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
      // El CUERPO del error viaja con la excepción: hay respuestas que traen el
      // dato que resuelve el problema (la caja que ya estaba abierta, el detalle
      // de una validación) y perderlo obliga a tratar todo como texto.
      const err = new Error(errorMsg) as Error & { status?: number; body?: any };
      err.status = res.status;
      err.body = body;
      throw err;
    }

    /**
     * Respuesta sin envoltorio: se devuelve tal cual.
     *
     * Casi todos los endpoints contestan `{ success, data }`, pero unos cuantos
     * devuelven el objeto directo — los que reenvían la respuesta de un servicio
     * externo (el worker de WhatsApp, por ejemplo). Devolver `body.data` a ciegas
     * les entregaba `undefined` a quienes llamaban, y reventaban con «Cannot read
     * properties of undefined» en vez de mostrar el resultado.
     *
     * Se pregunta por la LLAVE, no por el valor: un `data: null` a propósito
     * («no hay nada») tiene que seguir llegando como null, no como el sobre.
     */
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
