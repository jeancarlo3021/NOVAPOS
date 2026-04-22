import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useTenantId } from './useTenant';

type SettingType = 'general' | 'products' | 'payments' | 'users' | 'notifications' | 'receipt';

export const useSettings = (type: SettingType) => {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tenantId, loading: tenantLoading } = useTenantId();

  const fetchSettings = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('settings')
        .select('config')
        .eq('tenant_id', tenantId)
        .eq('type', type)
        .maybeSingle();

      if (err) throw err;
      setSettings(data?.config ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando configuración');
    } finally {
      setLoading(false);
    }
  }, [tenantId, type]);

  // Auto-fetch when tenantId resolves
  useEffect(() => {
    if (tenantId) fetchSettings();
  }, [tenantId, fetchSettings]);

  const updateSettings = useCallback(async (newSettings: any) => {
    if (!tenantId) {
      setError('Tenant ID no disponible');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Check if a record already exists
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('type', type)
        .maybeSingle();

      if (existing?.id) {
        // Update existing record
        const { error: err } = await supabase
          .from('settings')
          .update({ config: newSettings, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (err) throw err;
      } else {
        // Insert new record
        const { error: err } = await supabase
          .from('settings')
          .insert({ tenant_id: tenantId, type, config: newSettings });
        if (err) throw err;
      }

      setSettings(newSettings);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error guardando configuración';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [tenantId, type]);

  return {
    settings,
    loading: loading || tenantLoading,
    error,
    fetchSettings,
    updateSettings,
  };
};
