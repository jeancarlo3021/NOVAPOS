'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

export interface PlanFeatures {
  // Module access
  pos: boolean;
  inventory: boolean;
  reports: boolean;
  settings: boolean;
  users: boolean;
  // POS capabilities
  pos_card: boolean;
  pos_sinpe: boolean;
  pos_discount: boolean;
  // Inventory tiers
  inventory_products_only: boolean;
  // Reports tiers
  reports_basic: boolean;
  // Admin features
  admin_dashboard?: boolean;
  webhooks?: boolean;
  analytics?: boolean;
  api_access?: boolean;
  white_label?: boolean;
  integrations?: boolean;
  custom_branding?: boolean;
  unlimited_users?: boolean;
  user_management?: boolean;
  advanced_reports?: boolean;
  priority_support?: boolean;
  unlimited_orders?: boolean;
  team_collaboration?: boolean;
  unlimited_products?: boolean;
}

export const DEFAULT_FEATURES: PlanFeatures = {
  pos: true,
  inventory: false,
  reports: false,
  settings: true,
  users: false,
  pos_card: false,
  pos_sinpe: false,
  pos_discount: false,
  inventory_products_only: false,
  reports_basic: false,
};

export const FULL_FEATURES: PlanFeatures = {
  pos: true,
  inventory: true,
  reports: true,
  settings: true,
  users: true,
  pos_card: true,
  pos_sinpe: true,
  pos_discount: true,
  inventory_products_only: false,
  reports_basic: false,
};

// ✅ NUEVO: Tipo para el retorno de loadPlanFeatures
interface PlanData {
  features: PlanFeatures;
  name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  planFeatures: PlanFeatures;
  planName: string;
  loading: boolean;
  error: string | null;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  getRoleLabel: (role: string) => string;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshPlan: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// GET ROLE LABEL
// ============================================

export const getRoleLabel = (role: string): string => {
  const roleMap: Record<string, string> = {
    'owner': 'Propietario',
    'admin': 'Administrador',
    'gerente': 'Gerente',
    'asistente_1': 'Asistente 1',
    'asistente_2': 'Asistente 2',
    'asistente_3': 'Asistente 3',
    'cocinero': 'Cocinero',
    'mesero': 'Mesero',
    'cajero': 'Cajero',
    'almacenero': 'Almacenero',
    'contador': 'Contador',
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
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures>(DEFAULT_FEATURES);
  const [planName, setPlanName] = useState<string>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserIdRef = useRef<string | null>(null);
  const loadingSessionRef = useRef(false);
  // Generation counter: incremented on clearAuthState to cancel stale handlers
  const sessionGenRef = useRef(0);

  // ============================================
  // LOAD PLAN FEATURES - ✅ CORREGIDO
  // ============================================

  const loadPlanFeatures = async (tenantId: string): Promise<PlanData> => {
    try {
      console.log('🔄 Cargando plan para tenant:', tenantId);
      
      const { data: rows, error: err } = await supabase
        .from('subscriptions')
        .select('status, ends_at, subscription_plans(name, features)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (err) {
        console.warn('⚠️ Error cargando suscripción:', err);
      }

      const data = rows?.[0] ?? null;
      if (!data) {
        console.log('📋 No hay suscripción, usando plan por defecto: demo');
        return {
          features: DEFAULT_FEATURES,
          name: 'demo',
        };
      }

      // ✅ Verificar que la suscripción esté activa Y no expirada
      const now = new Date();
      const endsAt = data.ends_at ? new Date(data.ends_at) : null;
      const isExpired = endsAt && endsAt < now;

      if (data.status !== 'active' || isExpired) {
        console.log('⏰ Suscripción expirada o inactiva, usando plan por defecto');
        return {
          features: DEFAULT_FEATURES,
          name: 'demo',
        };
      }

      const plan = (data as any).subscription_plans;
      const planName: string = plan?.name ?? 'demo';
      console.log('✅ Plan cargado:', planName);

      // ✅ Merge DB features with defaults
      const dbFeatures: Partial<PlanFeatures> = plan?.features ?? {};
      const mergedFeatures = { ...DEFAULT_FEATURES, ...dbFeatures };

      // ✅ DEBUG: Mostrar las features cargadas
      console.log('DEBUG - Features cargadas:', mergedFeatures);

      return {
        features: mergedFeatures,
        name: planName,
      };
    } catch (err) {
      console.error('❌ Error cargando plan:', err);
      return {
        features: DEFAULT_FEATURES,
        name: 'demo',
      };
    }
  };

  // ============================================
  // LOAD TENANTS
  // ============================================

  const loadTenants = async (userId: string, userTenantId: string): Promise<{
    tenants: Tenant[];
    selectedTenant: Tenant | null;
  }> => {
    try {
      console.log('📦 Cargando tenants para usuario:', userId);

      const { data: ownedTenants } = await supabase
        .from('tenants')
        .select('id, name, owner_id, is_demo, created_at')
        .eq('owner_id', userId);

      let resolvedTenant = null;

      if (ownedTenants && ownedTenants.length > 0) {
        resolvedTenant = ownedTenants.find(t => t.id === userTenantId) ?? ownedTenants[0];
      } else if (userTenantId) {
        const { data: staffTenant } = await supabase
          .from('tenants')
          .select('id, name, owner_id, is_demo, created_at')
          .eq('id', userTenantId)
          .maybeSingle();
        resolvedTenant = staffTenant ?? null;
      }

      if (resolvedTenant) {
        console.log('🏢 Tenant encontrado:', resolvedTenant.name);
      } else {
        console.warn('⚠️ No se encontró tenant para el usuario');
      }

      return {
        tenants: ownedTenants || [],
        selectedTenant: resolvedTenant,
      };
    } catch (err) {
      console.error('❌ Error loading tenants:', err);
      return { tenants: [], selectedTenant: null };
    }
  };

  // ============================================
  // CLEAR STATE
  // ============================================

  const clearAuthState = () => {
    console.log('🧹 Limpiando estado de autenticación');
    sessionGenRef.current++; // Invalidate any in-progress handleSession
    setUser(null);
    setTenant(null);
    setTenants([]);
    setPlanFeatures(DEFAULT_FEATURES);
    setPlanName('demo');
    currentUserIdRef.current = null;
  };

  // ============================================
  // HANDLE SESSION - ✅ CORREGIDO
  // ============================================

  const handleSession = async (session: { user: { id: string } } | null) => {
    // Capture generation at entry — if clearAuthState() is called while we
    // await, our generation becomes stale and we bail out early.
    const gen = ++sessionGenRef.current;
    const isActive = () => gen === sessionGenRef.current;

    if (!session?.user) {
      console.log('👤 Sin sesión detectada');
      setUser(null);
      setTenant(null);
      setTenants([]);
      setPlanFeatures(DEFAULT_FEATURES);
      setPlanName('demo');
      currentUserIdRef.current = null;
      loadingSessionRef.current = false;
      setLoading(false);
      return;
    }

    // Skip if already loading this exact user (de-duplicate rapid-fire events)
    if (loadingSessionRef.current && currentUserIdRef.current === session.user.id) {
      console.log('⏳ Ya hay una carga en progreso para este usuario, ignorando...');
      return;
    }

    currentUserIdRef.current = session.user.id;
    loadingSessionRef.current = true;

    try {
      console.log('🔐 Cargando datos del usuario:', session.user.id);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, tenant_id, role, full_name, business_name')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!isActive()) return; // Superseded by a newer login/logout
      if (userError) throw userError;
      if (!userData) throw new Error('Usuario no encontrado en el sistema');

      setUser(userData);
      setError(null);
      console.log('✅ Usuario cargado:', userData.email);

      const [{ tenants: loadedTenants, selectedTenant }, planData] = await Promise.all([
        loadTenants(userData.id, userData.tenant_id),
        loadPlanFeatures(userData.tenant_id),
      ]);

      if (!isActive()) return; // Superseded while loading tenants/plan

      setTenants(loadedTenants);
      if (selectedTenant) setTenant(selectedTenant);
      setPlanFeatures(planData.features);
      setPlanName(planData.name);

      console.log('🎉 Autenticación completada - Plan:', planData.name);
    } catch (err) {
      if (!isActive()) return; // Stale error — don't corrupt fresh state
      const errorMsg = err instanceof Error ? err.message : 'Error de autenticación';
      console.error('❌ Error:', errorMsg);
      setError(errorMsg);
      clearAuthState();
    } finally {
      if (isActive()) {
        loadingSessionRef.current = false;
        setLoading(false);
      }
    }
  };

  // ============================================
  // EFFECT: SETUP AUTH LISTENERS
  // ============================================

  useEffect(() => {
    let mounted = true;

    const setupAuth = async () => {
      console.log('📍 Obteniendo sesión inicial...');
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (mounted) {
        await handleSession(session);
      }
    };

    setupAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔔 Auth event:', event);

        if (!mounted) return;

        if (event === 'INITIAL_SESSION') {
          console.log('⏭️ Ignorando INITIAL_SESSION (ya manejado)');
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          console.log('⏭️ Ignorando TOKEN_REFRESHED');
          return;
        }

        setLoading(true);
        // Defer past the Supabase internal session lock — calling authenticated
        // queries synchronously inside onAuthStateChange causes a deadlock.
        setTimeout(() => {
          if (mounted) handleSession(session);
        }, 0);
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
    console.log('🔑 Intentando login:', emailOrUsername);
    setError(null);
    setLoading(true);

    clearAuthState();

    const email = emailOrUsername.includes('@')
      ? emailOrUsername
      : `${emailOrUsername}@nexoerp.local`;

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        console.error('❌ Error de login:', signInError.message);
        setError(signInError.message);
        setLoading(false);
        throw signInError;
      }
      // onAuthStateChange fires SIGNED_IN and calls handleSession.
      // Navigation happens in Login.tsx via useEffect watching user+loading.
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  // ============================================
  // LOGOUT
  // ============================================

  const logout = async () => {
    console.log('🚪 Cerrando sesión');
    try {
      setError(null);
      setLoading(true);

      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) throw signOutError;

      clearAuthState();
      setLoading(false);
      console.log('✅ Sesión cerrada');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cerrar sesión';
      console.error('❌ Error al logout:', errorMsg);
      setError(errorMsg);
      setLoading(false);
      throw err;
    }
  };

  // ============================================
  // SWITCH TENANT - ✅ CORREGIDO
  // ============================================

  const switchTenant = async (tenantId: string) => {
    console.log('🏢 Cambiando a tenant:', tenantId);
    try {
      setError(null);

      const selectedTenant = tenants.find(t => t.id === tenantId);
      if (!selectedTenant) throw new Error('Tenant not found');

      if (user) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ tenant_id: tenantId })
          .eq('id', user.id);

        if (updateError) throw updateError;

        setUser({ ...user, tenant_id: tenantId });
        setTenant(selectedTenant);
        
        // ✅ USAR EL NUEVO OBJETO PlanData
        const planData = await loadPlanFeatures(tenantId);
        setPlanFeatures(planData.features);
        setPlanName(planData.name);
        
        console.log('✅ Tenant cambiado exitosamente - Plan:', planData.name);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar tenant';
      console.error('❌ Error:', errorMsg);
      setError(errorMsg);
      throw err;
    }
  };

  // ============================================
  // REFRESH PLAN - ✅ CORREGIDO
  // ============================================

  const refreshPlan = async (tenantId: string) => {
    console.log('🔄 Refrescando plan del tenant:', tenantId);
    const planData = await loadPlanFeatures(tenantId);
    setPlanFeatures(planData.features);
    setPlanName(planData.name);
    console.log('✅ Plan refrescado:', planData.name);
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
        planFeatures,
        planName,
        loading,
        error,
        login,
        logout,
        clearError,
        getRoleLabel,
        switchTenant,
        refreshPlan,
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