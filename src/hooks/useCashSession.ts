import { useState, useEffect, useCallback } from 'react';
import { CashSession } from '@/types/Types_POS';
import { supabase } from '@/lib/supabase';
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

    // 1. Try Supabase when online
    if (navigator.onLine) {
      try {
        const { data: rows, error: sbError } = await supabase
          .from('cash_sessions')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);

        if (sbError) throw sbError;

        const session = rows?.[0] ?? null;
        setCurrentSession(session);
        setFromCache(false);
        setError(null);

        // Cache for offline use
        posOfflineService.cacheSession(session);
        setLoading(false);
        return;
      } catch (err) {
        console.warn('⚠️ Could not load session from Supabase, trying cache:', err);
      }
    }

    // 2. Fallback: cached session
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
