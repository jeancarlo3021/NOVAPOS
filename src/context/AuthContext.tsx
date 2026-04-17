'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================
// INTERFACES
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
  full_name?: string;
  business_name?: string;
}

export interface Tenant {
  id: string;
  name: string;
  owner_id: string;
  is_demo: boolean;
  created_at?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  loading: boolean;
  error: string | null;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  getRoleLabel: (role: string) => string;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// GET ROLE LABEL
// ============================================

export const getRoleLabel = (role: string): string => {
  const roleMap: Record<string, string> = {
    'owner': 'Propietario',
    'admin': 'Administrador',
    'manager': 'Gerente',
    'cashier': 'Cajero',
    'chef': 'Chef',
    'waiter': 'Mesero',
    'kitchen': 'Cocina',
    'user': 'Usuario',
  };
  return roleMap[role] || role.charAt(0).toUpperCase() + role.slice(1);
};

// ============================================
// AUTH PROVIDER
// ============================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // LOAD TENANTS
  // ============================================

  const loadTenants = async (userId: string, userTenantId: string) => {
    try {
      // Obtener todos los tenants del usuario
      const { data: userTenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, owner_id, is_demo, created_at')
        .eq('owner_id', userId);

      if (tenantsError) throw tenantsError;

      setTenants(userTenants || []);

      // Establecer tenant actual
      if (userTenants && userTenants.length > 0) {
        const currentTenant = userTenants.find(t => t.id === userTenantId) || userTenants[0];
        setTenant(currentTenant);
      }
    } catch (err) {
      console.error('Error loading tenants:', err);
    }
  };

  // ============================================
  // INITIALIZE AUTH
  // ============================================

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        setLoading(true);

        // Obtener sesión actual
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.user) {
          if (mounted) {
            setUser(null);
            setTenant(null);
            setTenants([]);
            setLoading(false);
          }
          return;
        }

        // Obtener datos del usuario
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, tenant_id, role, full_name, business_name')
          .eq('id', session.user.id)
          .single();

        if (userError) throw userError;

        if (mounted) {
          setUser(userData);
          setError(null);

          // Cargar tenants
          await loadTenants(userData.id, userData.tenant_id);

          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Error de autenticación';
          setError(errorMsg);
          setUser(null);
          setTenant(null);
          setTenants([]);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listener para cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (!session?.user) {
          setUser(null);
          setTenant(null);
          setTenants([]);
          setLoading(false);
          return;
        }

        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, email, tenant_id, role, full_name, business_name')
            .eq('id', session.user.id)
            .single();

          if (userError) throw userError;

          setUser(userData);
          setError(null);

          // Cargar tenants
          await loadTenants(userData.id, userData.tenant_id);

          setLoading(false);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Error de autenticación';
          setError(errorMsg);
          setUser(null);
          setTenant(null);
          setTenants([]);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // ============================================
  // LOGIN
  // ============================================

  const login = async (emailOrUsername: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      // Convertir username a email si es necesario
      const email = emailOrUsername.includes('@')
        ? emailOrUsername
        : `${emailOrUsername}@nexoerp.local`;

      // Iniciar sesión
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      if (!data.user) throw new Error('No user data returned');

      // Obtener datos del usuario
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, tenant_id, role, full_name, business_name')
        .eq('id', data.user.id)
        .single();

      if (userError) throw userError;
      if (!userData) throw new Error('User not found in database');

      setUser(userData);

      // Cargar tenants
      await loadTenants(userData.id, userData.tenant_id);

      setLoading(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      setError(errorMsg);
      setUser(null);
      setTenant(null);
      setTenants([]);
      setLoading(false);
      throw err;
    }
  };

  // ============================================
  // LOGOUT
  // ============================================

  const logout = async () => {
    try {
      setError(null);
      setLoading(true);

      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) throw signOutError;

      setUser(null);
      setTenant(null);
      setTenants([]);
      setLoading(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cerrar sesión';
      setError(errorMsg);
      setLoading(false);
      throw err;
    }
  };

  // ============================================
  // SWITCH TENANT
  // ============================================

  const switchTenant = async (tenantId: string) => {
    try {
      setError(null);

      // Encontrar el tenant
      const selectedTenant = tenants.find(t => t.id === tenantId);
      if (!selectedTenant) throw new Error('Tenant not found');

      // Actualizar tenant_id del usuario
      if (user) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ tenant_id: tenantId })
          .eq('id', user.id);

        if (updateError) throw updateError;

        // Actualizar estado local
        setUser({ ...user, tenant_id: tenantId });
        setTenant(selectedTenant);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar tenant';
      setError(errorMsg);
      throw err;
    }
  };

  // ============================================
  // CLEAR ERROR
  // ============================================

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        tenant,
        tenants,
        loading, 
        error, 
        login, 
        logout, 
        clearError,
        getRoleLabel,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider');
  }
  return context;
};