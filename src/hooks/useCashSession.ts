import { useState, useEffect, useCallback } from 'react';
import { CashSession } from '@/types/Types_POS';
import { supabase } from '@/lib/supabase';
import { useTenant } from './useTenant';

export function useCashSession() {
  const { tenantId } = useTenant();
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar sesión abierta
  const loadOpenSession = useCallback(async () => {
    if (!tenantId) {
      console.warn('⚠️ No tenant ID disponible');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('📋 Cargando sesión abierta...');

      const { data, error: supabaseError } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .single();

      if (supabaseError && supabaseError.code !== 'PGRST116') {
        throw supabaseError;
      }

      if (data) {
        console.log('✅ Sesión abierta encontrada:', data.id);
        setCurrentSession(data);
      } else {
        console.log('ℹ️ No hay sesión abierta');
        setCurrentSession(null);
      }

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error cargando sesión:', errorMessage);
      setError(errorMessage);
      setCurrentSession(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Abrir nueva sesión
  const openSession = useCallback(async () => {
    if (!tenantId) {
      alert('⚠️ No hay tenant disponible');
      return;
    }

    try {
      setLoading(true);
      console.log('🔓 Abriendo nueva sesión...');

      const { data, error: supabaseError } = await supabase
        .from('cash_sessions')
        .insert([
          {
            tenant_id: tenantId,
            cash_register_id: `CAJA-${Date.now()}`,
            status: 'open',
            opening_balance: 0,
            opening_date: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (supabaseError) {
        throw supabaseError;
      }

      console.log('✅ Sesión abierta:', data.id);
      setCurrentSession(data);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error abriendo sesión:', errorMessage);
      setError(errorMessage);
      alert('❌ Error al abrir la caja: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Cerrar sesión
  const closeSession = useCallback(async () => {
    if (!currentSession) {
      alert('⚠️ No hay sesión abierta');
      return;
    }

    try {
      setLoading(true);
      console.log('🔒 Cerrando sesión...');

      const { error: supabaseError } = await supabase
        .from('cash_sessions')
        .update({
          status: 'closed',
          closing_date: new Date().toISOString(),
        })
        .eq('id', currentSession.id);

      if (supabaseError) {
        throw supabaseError;
      }

      console.log('✅ Sesión cerrada');
      setCurrentSession(null);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error cerrando sesión:', errorMessage);
      setError(errorMessage);
      alert('❌ Error al cerrar la caja: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  // Cargar sesión al iniciar
  useEffect(() => {
    loadOpenSession();
  }, [loadOpenSession]);

  return {
    currentSession,
    loading,
    error,
    openSession,
    closeSession,
    refetchSession: loadOpenSession,
  };
}