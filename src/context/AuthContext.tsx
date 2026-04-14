import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/authService';
import { tenantsService } from '@/services/tenantsService';
import { ROLE_LABELS } from '@/services/rolesService';

export interface User {
  id: string;
  email: string;
  role: string;
  business_name: string;
  full_name?: string;
  owner_id?: string;
  tenant_id?: string;
}

export interface Tenant {
  id: string;
  owner_id: string;
  name: string;
  schema_name: string;
  status: string;
  is_demo: boolean;
  trial_ends_at?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  loading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  getRoleLabel: (role: string) => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          try {
            const { data: userData, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (error) {
              console.error('Error al obtener datos del usuario:', error);
              setUser(null);
              setTenant(null);
            } else {
              setUser(userData);

              // Obtener tenants del usuario
              const userTenants = await tenantsService.getUserTenants(session.user.id);
              setTenants(userTenants);

              // Obtener tenant actual
              if (userData.tenant_id) {
                const currentTenant = userTenants.find(t => t.id === userData.tenant_id);
                setTenant(currentTenant || null);
              } else if (userTenants.length > 0) {
                setTenant(userTenants[0]);
              }
            }
          } catch (error) {
            console.error('Error:', error);
            setUser(null);
            setTenant(null);
          }
        } else {
          setUser(null);
          setTenant(null);
          setTenants([]);
        }
        setLoading(false);
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const login = async (emailOrUsername: string, password: string) => {
    setLoading(true);
    try {
      const result = await authService.login(emailOrUsername, password);
      setUser(result.userData);

      // Obtener tenants
      const userTenants = await tenantsService.getUserTenants(result.userData.id);
      setTenants(userTenants);

      if (result.userData.tenant_id) {
        const currentTenant = userTenants.find(t => t.id === result.userData.tenant_id);
        setTenant(currentTenant || null);
      } else if (userTenants.length > 0) {
        setTenant(userTenants[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setTenant(null);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const switchTenant = async (tenantId: string) => {
    try {
      const newTenant = tenants.find(t => t.id === tenantId);
      if (newTenant) {
        setTenant(newTenant);
        // Actualizar en BD
        await supabase
          .from('users')
          .update({ tenant_id: tenantId })
          .eq('id', user!.id);
      }
    } catch (error) {
      console.error('Error al cambiar tenant:', error);
    }
  };

  const getRoleLabel = (role: string) => {
    return ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role;
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        tenant, 
        tenants,
        loading, 
        login, 
        logout, 
        switchTenant,
        getRoleLabel 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
