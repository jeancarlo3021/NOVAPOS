'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { setRememberMe } from '@/lib/authStorage';
import { globalCacheService } from '@/services/cache/globalCacheService';

// ============================================
// AUTH CACHE (localStorage) — offline support
// ============================================

const AUTH_CACHE_KEY = 'novapos_auth_cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AuthCache {
  userId: string;
  user: AuthUser;
  tenant: Tenant | null;
  tenants: Tenant[];
  planFeatures: PlanFeatures;
  planName: string;
  cachedAt: number;
}

function readAuthCache(): AuthCache | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const cache: AuthCache = JSON.parse(raw);
    if (Date.now() - cache.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(AUTH_CACHE_KEY);
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

function writeAuthCache(data: Omit<AuthCache, 'cachedAt'>) {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {}
}

function clearAuthCache() {
  localStorage.removeItem(AUTH_CACHE_KEY);
}

function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') || msg.includes('fetch') ||
      msg.includes('timeout') || msg.includes('connection') ||
      msg.includes('failed to fetch') || msg.includes('load failed')
    );
  }
  return false;
}

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

export interface TenantSubscription {
  id: string;
  status: string;
  started_at?: string;
  ends_at?: string;
  auto_renew?: boolean;
  plan?: {
    id: string;
    name: string;
    description?: string;
    price?: number;
    billing_cycle?: string;
    max_users?: number;
    max_products?: number;
    max_orders?: number;
    features?: Record<string, unknown>;
  } | null;
}

export interface Tenant {
  id: string;
  name: string;
  owner_id: string;
  is_demo: boolean;
  created_at?: string;
  subscription_id?: string;
  plan_id?: string;
  status?: 'active' | 'suspended' | 'inactive' | 'cancelled' | 'trial';
  subscription?: TenantSubscription | null;
}

export interface PlanFeatures {
  // ── Módulos principales ────────────────────────────────────────────────────
  pos: boolean;
  inventory: boolean;
  reports: boolean;
  settings: boolean;
  users: boolean;
  expenses: boolean;
  purchases: boolean;
  accounts_payable: boolean;
  // ── POS ────────────────────────────────────────────────────────────────────
  pos_card: boolean;
  pos_sinpe: boolean;
  pos_discount: boolean;
  pos_cash_management?: boolean;     // Apertura/cierre de caja
  pos_customer_display?: boolean;    // Display de cliente serial
  pos_void_invoice?: boolean;        // Anular facturas emitidas
  pos_invoice_preview?: boolean;     // Mostrar nº próxima factura en escritorio
  pos_customer_field?: boolean;      // Campo de cliente en escritorio
  pos_search_tabs?: boolean;         // Tabs separados código/nombre en escritorio
  // ── Inventario ─────────────────────────────────────────────────────────────
  inventory_products_only: boolean;
  inventory_mixed_stock?: boolean;       // Productos con/sin stock mixtos
  inventory_categories?: boolean;        // Tab Categorías
  inventory_unit_types?: boolean;        // Tab Tipos de unidad
  inventory_suppliers?: boolean;         // Tab Proveedores
  inventory_stock_view?: boolean;        // Tab Stock
  inventory_low_stock_alerts?: boolean;  // Tab Alertas
  inventory_stock_adjustments?: boolean; // Ajustes manuales con motivo
  // ── Reportes ───────────────────────────────────────────────────────────────
  reports_basic: boolean;                // Ventas básicas (compat)
  report_advanced_sales?: boolean;
  report_hourly_sales?: boolean;
  report_profit?: boolean;
  report_sellers?: boolean;
  report_product_detail?: boolean;
  report_stock?: boolean;
  report_stock_adjustments?: boolean;
  report_cash_sessions?: boolean;
  report_expenses?: boolean;
  report_purchases?: boolean;
  // ── Usuarios ───────────────────────────────────────────────────────────────
  users_roles?: boolean;     // Tab Roles
  users_teams?: boolean;     // Tab Equipos
  users_shifts?: boolean;    // Tab Turnos
  users_activity?: boolean;  // Tab Actividad
  // ── Módulos opcionales ────────────────────────────────────────────────────
  recipes?: boolean;
  hr?: boolean;
  promotions?: boolean;
  tables?: boolean;
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
  pos_cash_management: false,
  pos_customer_display: false,
  pos_void_invoice: false,
  pos_invoice_preview: false,
  pos_customer_field: false,
  pos_search_tabs: false,
  inventory_products_only: false,
  inventory_mixed_stock: false,
  inventory_categories: false,
  inventory_unit_types: false,
  inventory_suppliers: false,
  inventory_stock_view: false,
  inventory_low_stock_alerts: false,
  inventory_stock_adjustments: false,
  reports_basic: false,
  report_advanced_sales: false,
  report_hourly_sales: false,
  report_profit: false,
  report_sellers: false,
  report_product_detail: false,
  report_stock: false,
  report_stock_adjustments: false,
  report_cash_sessions: false,
  report_expenses: false,
  report_purchases: false,
  users_roles: false,
  users_teams: false,
  users_shifts: false,
  users_activity: false,
  expenses: false,
  purchases: false,
  accounts_payable: false,
  recipes: false,
  hr: false,
  promotions: false,
  tables: false,
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
  pos_cash_management: true,
  pos_customer_display: true,
  pos_void_invoice: true,
  pos_invoice_preview: true,
  pos_customer_field: true,
  pos_search_tabs: true,
  inventory_products_only: false,
  inventory_mixed_stock: true,
  inventory_categories: true,
  inventory_unit_types: true,
  inventory_suppliers: true,
  inventory_stock_view: true,
  inventory_low_stock_alerts: true,
  inventory_stock_adjustments: true,
  reports_basic: true,
  report_advanced_sales: true,
  report_hourly_sales: true,
  report_profit: true,
  report_sellers: true,
  report_product_detail: true,
  report_stock: true,
  report_stock_adjustments: true,
  report_cash_sessions: true,
  report_expenses: true,
  report_purchases: true,
  users_roles: true,
  users_teams: true,
  users_shifts: true,
  users_activity: true,
  expenses: true,
  purchases: true,
  accounts_payable: true,
  recipes: true,
  hr: true,
  promotions: true,
  tables: true,
};

interface PlanData {
  features: PlanFeatures;
  name: string;
}

// Extracts plan features from a tenant's joined subscription (no extra DB call needed)
function extractPlanData(tenant: Tenant | null, defaults: PlanFeatures): PlanData {
  const sub = tenant?.subscription;
  if (!sub) return { features: defaults, name: 'demo' };

  if (sub.status !== 'active') {
    return { features: defaults, name: 'demo' };
  }

  const plan = sub.plan;
  if (!plan) return { features: defaults, name: 'demo' };

  return {
    features: { ...defaults, ...(plan.features as Partial<PlanFeatures>) },
    name: plan.name,
  };
}

interface AuthContextType {
  user: AuthUser | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  planFeatures: PlanFeatures;
  planName: string;
  loading: boolean;
  error: string | null;
  login: (emailOrUsername: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  getRoleLabel: (role: string) => string;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshPlan: (tenantId: string) => Promise<void>;
  // ── Multi-sucursal ────────────────────────────────────────────────────
  branches: BranchLite[];
  currentBranchId: string | null;
  switchBranch: (branchId: string) => void;
  reloadBranches: () => Promise<void>;
}

export interface BranchLite {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
  is_user_default?: boolean;
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
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [currentBranchId, setCurrentBranchIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('novapos_current_branch_id'); } catch { return null; }
  });
  const [planName, setPlanName] = useState<string>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserIdRef = useRef<string | null>(null);
  const loadingSessionRef = useRef(false);
  const sessionGenRef = useRef(0);
  // Set to true while THIS tab is actively signing out, so we don't
  // treat our own SIGNED_OUT event as coming from another tab.
  const isSigningOutRef = useRef(false);

  // ============================================
  // LOAD PLAN FEATURES - ✅ CORREGIDO
  // ============================================

  const loadPlanFeatures = async (tenantId: string): Promise<PlanData> => {
    try {
      
      const { data: rows, error: err } = await supabase
        .from('subscriptions')
        .select('status, ends_at, subscription_plans(name, features)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (err) {
      }

      const data = rows?.[0] ?? null;
      if (!data) {
        return {
          features: DEFAULT_FEATURES,
          name: 'demo',
        };
      }

      if (data.status !== 'active') {
        return {
          features: DEFAULT_FEATURES,
          name: 'demo',
        };
      }

      const plan = (data as any).subscription_plans;
      const planName: string = plan?.name ?? 'demo';

      // ✅ Merge DB features with defaults
      const dbFeatures: Partial<PlanFeatures> = plan?.features ?? {};
      const mergedFeatures = { ...DEFAULT_FEATURES, ...dbFeatures };

      // ✅ DEBUG: Mostrar las features cargadas

      return {
        features: mergedFeatures,
        name: planName,
      };
    } catch (err) {
      return {
        features: DEFAULT_FEATURES,
        name: 'demo',
      };
    }
  };

  // ============================================
  // LOAD TENANTS
  // ============================================

  const TENANT_SELECT = `
    id, name, owner_id, is_demo, created_at, subscription_id, plan_id, status,
    subscription:subscriptions!tenants_subscription_id_fkey (
      id, status, started_at, ends_at, auto_renew,
      plan:plan_id (
        id, name, description, price, billing_cycle,
        max_users, max_products, max_orders, features
      )
    )
  `;

  const loadTenants = async (userId: string, userTenantId: string): Promise<{
    tenants: Tenant[];
    selectedTenant: Tenant | null;
    planData: PlanData;
  }> => {
    try {

      const { data: ownedTenants } = await supabase
        .from('tenants')
        .select(TENANT_SELECT)
        .eq('owner_id', userId);

      let resolvedTenant: Tenant | null = null;

      const toTenant = (raw: any): Tenant => ({
        ...raw,
        // Supabase returns FK-joined rows as single objects but types them as arrays
        subscription: Array.isArray(raw.subscription) ? raw.subscription[0] ?? null : raw.subscription ?? null,
      });

      if (ownedTenants && ownedTenants.length > 0) {
        const mapped = ownedTenants.map(toTenant);
        resolvedTenant = mapped.find(t => t.id === userTenantId) ?? mapped[0];
      } else if (userTenantId) {
        const { data: staffTenant } = await supabase
          .from('tenants')
          .select(TENANT_SELECT)
          .eq('id', userTenantId)
          .maybeSingle();
        resolvedTenant = staffTenant ? toTenant(staffTenant) : null;
      }

      if (resolvedTenant) {
      } else {
      }

      const planData = extractPlanData(resolvedTenant, DEFAULT_FEATURES);

      return {
        tenants: (ownedTenants ?? []).map(toTenant),
        selectedTenant: resolvedTenant,
        planData,
      };
    } catch (err) {
      return { tenants: [], selectedTenant: null, planData: { features: DEFAULT_FEATURES, name: 'demo' } };
    }
  };

  // ============================================
  // CLEAR STATE
  // ============================================

  const clearAuthState = () => {
    sessionGenRef.current++;   // Invalidate any in-progress handleSession
    loadingSessionRef.current = false; // Allow next login to proceed
    currentUserIdRef.current  = null;
    setUser(null);
    setTenant(null);
    setTenants([]);
    setPlanFeatures(DEFAULT_FEATURES);
    setPlanName('demo');
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
      clearAuthCache();
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

    const userId = session.user.id;

    // Skip if already loading this exact user (de-duplicate rapid-fire events)
    if (loadingSessionRef.current && currentUserIdRef.current === session.user.id) {
      return;
    }

    currentUserIdRef.current = session.user.id;
    loadingSessionRef.current = true;

    try {

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

      const { tenants: loadedTenants, selectedTenant, planData: joinedPlanData } = await loadTenants(userData.id, userData.tenant_id);

      if (!isActive()) return; // Superseded while loading tenants/plan

      // If the FK join didn't find a plan (tenant.subscription_id may be null),
      // fall back to querying subscriptions directly by tenant_id.
      let planData = joinedPlanData;
      if (planData.name === 'demo' && selectedTenant) {
        planData = await loadPlanFeatures(selectedTenant.id);
      }

      if (!isActive()) return;

      setTenants(loadedTenants);
      if (selectedTenant) setTenant(selectedTenant);
      setPlanFeatures(planData.features);
      setPlanName(planData.name);

      // Persist to localStorage so next load works offline
      writeAuthCache({
        userId,
        user: userData,
        tenant: selectedTenant,
        tenants: loadedTenants,
        planFeatures: planData.features,
        planName: planData.name,
      });


      // ✅ Pre-cache all essential data globally for offline functionality
      if (selectedTenant && navigator.onLine) {
        globalCacheService.preCacheAllData(selectedTenant.id)
          .then((stats) => {
          })
          .catch((err) => {
            console.warn('⚠️ Error en pre-cacheo (no crítico):', err);
          });
      }
    } catch (err) {
      if (!isActive()) return; // Stale error — don't corrupt fresh state
      const errorMsg = err instanceof Error ? err.message : 'Error de autenticación';

      // If it's a network error, fall back to cached data for this user
      const cache = readAuthCache();
      if (isNetworkError(err) && cache && cache.userId === userId) {
        setUser(cache.user);
        setTenant(cache.tenant);
        setTenants(cache.tenants);
        setPlanFeatures(cache.planFeatures);
        setPlanName(cache.planName);
        setError(null);
      } else {
        setError(errorMsg);
        clearAuthState();
      }
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
      // Preload from cache immediately so ProtectedRoute doesn't redirect
      // while the network call is in-flight
      const cache = readAuthCache();
      if (cache && mounted) {
        setUser(cache.user);
        setTenant(cache.tenant);
        setTenants(cache.tenants);
        setPlanFeatures(cache.planFeatures);
        setPlanName(cache.planName);
        setLoading(false);
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        // No valid session — clear any stale cache and state
        if (cache) {
          clearAuthCache();
          clearAuthState();
          setLoading(false);
        } else {
          setLoading(false);
        }
        return;
      }

      // Refresh data in background (don't block navigation if cache exists)
      if (cache) {
        handleSession(session); // fire-and-forget — updates state when done
      } else {
        await handleSession(session);
      }
    };

    setupAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {

        if (!mounted) return;

        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          return;
        }

        // ── Cross-tab isolation ──────────────────────────────────────────────
        // Supabase uses BroadcastChannel to propagate auth events to all tabs.
        // Multiple SIGNED_IN events can arrive in rapid succession (within the
        // same event-loop tick) before any setTimeout fires. We lock the ref
        // SYNCHRONOUSLY here so the second event sees it and gets blocked.

        if (event === 'SIGNED_IN' && session?.user) {
          if (currentUserIdRef.current && session.user.id !== currentUserIdRef.current) {
            // A different user signed in from another tab — ignore completely.
            return;
          }
          // Lock this tab's user ID synchronously, before the async handler
          // runs in the next tick. This prevents a second cross-tab SIGNED_IN
          // (arriving in the same batch) from slipping through the guard.
          if (!currentUserIdRef.current) {
            currentUserIdRef.current = session.user.id;
          }
        }

        if (event === 'SIGNED_OUT') {
          // If this tab still has a user and WE didn't trigger the logout,
          // it's from another tab — leave this tab's session intact.
          if (currentUserIdRef.current && !isSigningOutRef.current) {
            return;
          }
        }
        // ────────────────────────────────────────────────────────────────────

        setLoading(true);
        setTimeout(() => {
          if (mounted) handleSession(session);
        }, 0);
      }
    );

    // Proactive token refresh every 30 minutes to keep session alive for 12h
    const refreshInterval = setInterval(async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // Silently fail — autoRefreshToken will retry
      }
    }, 30 * 60 * 1000); // 30 minutes

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime: si el admin cambia el status del tenant (suspended/inactive/
  // cancelled/active), nos llega el evento y actualizamos el state al
  // instante. ProtectedRoute se re-renderiza y muestra / oculta el modal de
  // "Cuenta suspendida" sin necesidad de recargar.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenant?.id) return;
    const channelName = `tenant_status_${tenant.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tenants', filter: `id=eq.${tenant.id}` },
        (payload: any) => {
          const next = payload?.new;
          if (!next) return;
          setTenant(prev => prev ? { ...prev, status: next.status, name: next.name ?? prev.name } : prev);
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [tenant?.id]);

  // Backup: si una llamada al API devuelve 403 con code=tenant_suspended,
  // apiFetch dispara este evento global. Garantiza el bloqueo incluso si la
  // suscripción realtime se desconectó.
  useEffect(() => {
    const onStatusChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ status?: string }>).detail;
      const status = detail?.status ?? 'suspended';
      setTenant(prev => prev ? { ...prev, status: status as Tenant['status'] } : prev);
    };
    window.addEventListener('tenant-status-changed', onStatusChanged);
    return () => window.removeEventListener('tenant-status-changed', onStatusChanged);
  }, []);

  // ============================================
  // LOGIN
  // ============================================

  const login = async (emailOrUsername: string, password: string, rememberMe = false) => {
    setError(null);
    setLoading(true);

    // Set remember-me flag BEFORE signIn so authStorage mirrors the token
    setRememberMe(rememberMe);

    clearAuthState();

    const email = emailOrUsername.includes('@')
      ? emailOrUsername
      : `${emailOrUsername}@nexoerp.local`;

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
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
    try {
      setError(null);
      setLoading(true);

      // Flag so onAuthStateChange knows this SIGNED_OUT is from THIS tab
      isSigningOutRef.current = true;

      // scope:'local' clears only this tab's session — other tabs are unaffected
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      setRememberMe(false);

      if (signOutError) throw signOutError;

      isSigningOutRef.current = false;
      clearAuthCache();
      clearAuthState();
      setLoading(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cerrar sesión';
      setError(errorMsg);
      setLoading(false);
      throw err;
    }
  };

  // ============================================
  // SWITCH TENANT - ✅ CORREGIDO
  // ============================================

  const switchTenant = async (tenantId: string) => {
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
        
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar tenant';
      setError(errorMsg);
      throw err;
    }
  };

  // ============================================
  // REFRESH PLAN - ✅ CORREGIDO
  // ============================================

  const refreshPlan = async (tenantId: string) => {
    const planData = await loadPlanFeatures(tenantId);
    setPlanFeatures(planData.features);
    setPlanName(planData.name);
  };

  // ============================================
  // BRANCHES (Multi-sucursal)
  // ============================================

  const reloadBranches = async () => {
    if (!tenant?.id) { setBranches([]); return; }
    try {
      // import dinámico para no introducir dependencia circular del service.
      const { branchesService } = await import('@/services/branches/branchesService');
      const list = await branchesService.mine();
      const lite: BranchLite[] = (list ?? []).map(b => ({
        id: b.id, name: b.name, code: b.code,
        is_default: b.is_default, is_user_default: b.is_user_default,
      }));
      setBranches(lite);

      // Asegura que currentBranchId apunte a una sucursal válida.
      if (lite.length > 0 && !lite.some(b => b.id === currentBranchId)) {
        const pick = lite.find(b => b.is_user_default) ?? lite.find(b => b.is_default) ?? lite[0];
        setCurrentBranchIdState(pick.id);
        try { localStorage.setItem('novapos_current_branch_id', pick.id); } catch { /* ignore */ }
      }
    } catch {
      // Si el backend aún no tiene la ruta (deploy pendiente), no bloquea.
      setBranches([]);
    }
  };

  const switchBranch = (branchId: string) => {
    setCurrentBranchIdState(branchId);
    try { localStorage.setItem('novapos_current_branch_id', branchId); } catch { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent('branch-changed', { detail: { branchId } }));
    } catch { /* SSR */ }
  };

  // Recarga sucursales al cambiar tenant o al loguearse.
  useEffect(() => { reloadBranches(); /* eslint-disable-next-line */ }, [tenant?.id]);

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
        branches,
        currentBranchId,
        switchBranch,
        reloadBranches,
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