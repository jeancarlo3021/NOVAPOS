import { useState, useEffect, useCallback } from 'react';
import { CashSession } from '@/types/Types_POS';
import { apiFetch } from '@/lib/api';
import { useTenant } from './useTenant';
import { posOfflineService } from '@/services/pos/posOfflineService';

export function useCashSession() {
  const { tenantId } = useTenant();
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadOpenSession = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Try API when online
    if (navigator.onLine) {
      try {
        const session = await apiFetch<CashSession | null>('/cash-sessions/active');

        setCurrentSession(session);
        setFromCache(false);
        setError(null);

        // Cache for offline use
        if (session) {
          posOfflineService.cacheSession(session);
        }
        setLoading(false);
        return;
      } catch (err) {
      }
    }

    // 2. Fallback: cached session
    console.log('[useCashSession] Cargando desde cache (offline o API falló)...');
    const cached = posOfflineService.getCachedSession();
    setCurrentSession(cached);
    setFromCache(true);
    setError(null);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadOpenSession();
  }, [loadOpenSession]);

  return {
    currentSession,
    loading,
    error,
    fromCache,
    refetchSession: loadOpenSession,
  };
}
