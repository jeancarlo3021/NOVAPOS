import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';

const TENANT_CACHE_KEY = (userId: string) => `novapos_tenant_${userId}`;

export const useTenantId = () => {
  const { user } = useAuth();

  // Initialize from localStorage so offline users get tenantId immediately
  const [tenantId, setTenantId] = useState<string | null>(() => {
    if (!user?.id) return null;
    return localStorage.getItem(TENANT_CACHE_KEY(user.id));
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getTenantId = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!user) {
          setError('Usuario no autenticado');
          setTenantId(null);
          return;
        }

        // 0. If we already have it from localStorage, set it fast
        const cached = localStorage.getItem(TENANT_CACHE_KEY(user.id));
        if (cached) setTenantId(cached);

        // 1. Try from user_metadata (JWT — available offline)
        let id = (user as any)?.user_metadata?.tenant_id;

        // 2. Try from user.tenant_id (JWT — available offline)
        if (!id) id = (user as any)?.tenant_id;

        if (id) {
          setTenantId(id);
          localStorage.setItem(TENANT_CACHE_KEY(user.id), id);
          return;
        }

        // 3+ DB lookups — only when online; use cache if offline
        if (!navigator.onLine) {
          if (cached) {
            setTenantId(cached);
          } else {
            setError('Sin conexión — no se pudo obtener el tenant');
          }
          return;
        }

        // 3. Fetch tenant from API (falls back to DB server-side)
        try {
          const data = await apiFetch<{ tenant_id: string }>('/tenants/me');
          if (data?.tenant_id) id = data.tenant_id;
        } catch {
          // API unreachable — handled below
        }

        if (id) {
          setTenantId(id);
          localStorage.setItem(TENANT_CACHE_KEY(user.id), id);
        } else {
          setError('No se pudo obtener el Tenant ID');
        }
      } catch (err) {
        const cached = user?.id ? localStorage.getItem(TENANT_CACHE_KEY(user.id)) : null;
        if (cached) {
          setTenantId(cached);
        } else {
          const message = err instanceof Error ? err.message : 'Error desconocido';
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    };

    getTenantId();
  }, [user?.id]);

  return { tenantId, loading, error };
};

export const useTenant = useTenantId;
