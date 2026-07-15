import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from './useTenant';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';

type SettingType = 'general' | 'products' | 'payments' | 'users' | 'notifications' | 'receipt' | 'delivery';

export const useSettings = (type: SettingType) => {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const { tenantId, loading: tenantLoading } = useTenantId();

  const fetchSettings = useCallback(async () => {
    if (!tenantId) return;

    const ck = cacheKey(tenantId, `settings_${type}`);

    // Apply cache immediately so UI is never blank
    const cached = cacheGet<any>(ck);
    if (cached !== null) setSettings(cached);

    if (!navigator.onLine) return; // stay with cached value offline

    setLoading(true);
    setError(null);
    try {
      const config = await apiFetch<any>(`/settings/${type}`);
      setSettings(config);
      if (config !== null) cacheSet(ck, config);
    } catch (err) {
      if (cached === null)
        setError(err instanceof Error ? err.message : 'Error cargando configuración');
      // else: keep cached value, silently ignore error
    } finally {
      setLoading(false);
    }
  }, [tenantId, type]);

  useEffect(() => {
    if (tenantId) fetchSettings();
  }, [tenantId, fetchSettings]);

  const updateSettings = useCallback(async (newSettings: any) => {
    if (!tenantId) { setError('Tenant ID no disponible'); return; }

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/settings/${type}`, {
        method: 'PUT',
        body: JSON.stringify(newSettings),
      });

      setSettings(newSettings);
      // Update cache so offline POS picks up new settings immediately
      cacheSet(cacheKey(tenantId, `settings_${type}`), newSettings);

      // Invalidar cache del printer service si es receipt
      if (type === 'receipt') {
        try { localStorage.removeItem(`receipt_cfg_${tenantId}`); } catch {}
        const { posPrinterService } = await import('@/services/pos/posPrinterService');
        posPrinterService.clearConfigCache();
      }

      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error guardando configuración';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [tenantId, type]);

  return { settings, loading: loading || tenantLoading, error, fetchSettings, updateSettings };
};
