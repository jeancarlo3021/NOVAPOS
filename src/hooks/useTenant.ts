import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export const useTenantId = () => {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
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

        // 1️⃣ Intentar obtener del user_metadata
        let id = (user as any)?.user_metadata?.tenant_id;
        console.log('📍 Tenant ID desde user_metadata:', id);

        // 2️⃣ Si no está, intentar desde user.tenant_id
        if (!id) {
          id = (user as any)?.tenant_id;
          console.log('📍 Tenant ID desde user.tenant_id:', id);
        }

        // 3️⃣ Si aún no hay, buscar en la tabla users
        if (!id) {
          const { data, error: userError } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .maybeSingle();

          if (userError) {
            console.warn('⚠️ Error buscando tenant_id en users:', userError);
          } else if (data?.tenant_id) {
            id = data.tenant_id;
            console.log('📍 Tenant ID desde users:', id);
          }
        }

        // 4️⃣ Si aún no hay, buscar en la tabla tenants
        if (!id) {
          const { data, error: tenantError } = await supabase
            .from('tenants')
            .select('id')
            .eq('owner_id', user.id)
            .maybeSingle();

          if (tenantError) {
            console.warn('⚠️ Error buscando tenant del propietario:', tenantError);
          } else if (data?.id) {
            id = data.id;
            console.log('📍 Tenant ID como propietario:', id);
          }
        }

        if (!id) {
          setError('No se pudo obtener el Tenant ID');
          console.error('❌ Tenant ID no disponible después de todos los intentos');
        } else {
          setTenantId(id);
          console.log('✅ Tenant ID obtenido:', id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setError(message);
        console.error('❌ Error obteniendo Tenant ID:', err);
      } finally {
        setLoading(false);
      }
    };

    getTenantId();
  }, [user?.id]);

  return { tenantId, loading, error };
};

export const useTenant = useTenantId;