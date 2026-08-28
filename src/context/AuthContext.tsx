'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { setRememberMe } from '@/lib/authStorage';
import { globalCacheService } from '@/services/cache/globalCacheService';
import { identifySentryUser, clearSentryUser } from '@/lib/sentryUser';

// ============================================
// AUTH CACHE (localStorage) — offline support
// ============================================

const AUTH_CACHE_KEY = 'novapos_auth_cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Timeout de sesión por edad ──────────────────────────────────────────────
// Forzamos re-login después de N horas desde el último login.
// Si querés 18h, cambiá la constante.
const SESSION_LOGIN_TS_KEY = 'novapos_session_login_ts';
/**
 * Hora a la que vence la sesión: una vez al día, de madrugada.
 *
 * Antes la sesión duraba 18 horas CONTADAS DESDE EL LOGIN, y ese era el
 * problema: quien entraba a las 4 p. m. quedaba expulsado a las 10 de la mañana
 * siguiente, en plena atención. Como la hora del corte dependía de cuándo se
 * había entrado, se sentía aleatorio.
 *
 * Con un corte fijo, la sesión SIEMPRE muere de madrugada y nunca en horario de
 * trabajo: se entra una vez al abrir y se queda todo el día. Las 4 a. m. dejan
 * pasar a los negocios que cierran tarde.
 */
const SESSION_CUTOFF_HOUR = 4;
/**
 * Piso de duración.
 *
 * Sin esto, entrar a las 3:50 a. m. daría una sesión de diez minutos. Si el
 * próximo corte está más cerca que esto, se pasa al del día siguiente.
 */
const SESSION_MIN_MS = 6 * 60 * 60 * 1000; // 6h
// Cada cuánto chequeamos si la sesión expiró.
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5min

/** Momento en que vence una sesión iniciada en `loginTs`. */
function sessionExpiresAt(loginTs: number): number {
  const d = new Date(loginTs);
  const cut = new Date(d);
  cut.setHours(SESSION_CUTOFF_HOUR, 0, 0, 0);
  // El corte de HOY ya pasó (o está muy cerca): se toma el de mañana.
  while (cut.getTime() - loginTs < SESSION_MIN_MS) {
    cut.setDate(cut.getDate() + 1);
  }
  return cut.getTime();
}

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

// Borra TODO el cache local de la app (datos pre-cacheados de todos los
// tenants, settings, colas, etc.). Se usa al expirar la sesión por edad para
// que el próximo login arranque con datos frescos.
function clearAllAppCache() {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('novapos_cache_') ||   // datos pre-cacheados por tenant
        // Marca de la sincronización incremental del catálogo. Si se borra el
        // caché pero se deja la marca, el POS pide «lo que cambió desde ayer»
        // sin tener contra qué compararlo y se queda con medio catálogo.
        k.startsWith('novapos_products_since_') ||
        k.startsWith('receipt_cfg_') ||      // config de recibo
        k === AUTH_CACHE_KEY
      ) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* SSR / acceso denegado */ }
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
  ticket_alias?: string;   // alias para "Atendido por:" en el ticket
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
  accounts_receivable?: boolean;
  /** Excluir ciertos clientes (ej. compras de empleados a crédito) del cierre de caja. */
  exclude_from_close?: boolean;
  proformas?: boolean;   // módulo de cotizaciones/proformas
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
  pos_usd?: boolean;                 // Cobro en dólares (efectivo) con tipo de cambio BCCR
  pos_delivery?: boolean;             // Ventas por delivery (mesa/delivery, plataformas, reporte)
  pos_bipper?: boolean;               // Bipper/localizador: nº o nombre que sale en el ticket
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
  report_taxes?: boolean;         // Reporte de impuestos (IVA) + cierre mensual
  report_vouchers?: boolean;      // Comprobantes de pagos y anulaciones
  // ── Usuarios ───────────────────────────────────────────────────────────────
  users_roles?: boolean;     // Tab Roles
  users_teams?: boolean;     // Tab Equipos
  users_shifts?: boolean;    // Tab Turnos
  users_activity?: boolean;  // Tab Actividad
  // ── Multi-sucursal ────────────────────────────────────────────────────────
  multi_branch?: boolean;           // Sucursales y Bodegas
  multi_branch_transfers?: boolean; // Transferencias entre bodegas (requiere multi_branch)
  // ── Módulos opcionales ────────────────────────────────────────────────────
  recipes?: boolean;
  hr?: boolean;
  promotions?: boolean;
  labels?: boolean;           // Etiquetas de productos (plantillas + impresión)
  customers?: boolean;        // Módulo de clientes
  customer_prices?: boolean;  // Precios personalizados por cliente (activable aparte)
  distribution?: boolean;     // Distribución (rutas de reparto en camión)
  tracking?: boolean;         // Rastreo de camiones en vivo (mapa + ajustes)
  /** Equipo en vivo: dónde anda cada persona (agentes, repartidores) en el mapa.
   *  Va aparte del rastreo de camiones: hay negocios sin flota que igual quieren
   *  ver a sus agentes, y flotas que no comparten la ubicación de la gente. */
  live_team?: boolean;
  tables?: boolean;
  /** Módulo de restaurante: cobro por mesas, toma de pedido full-screen,
   *  adicionales/modificadores, dividir cuenta y comandas. */
  restaurant?: boolean;
  /** Cuentas por MESA: abrir cuenta, sumar rondas y cobrar (requiere `tables`). */
  table_orders?: boolean;
  /** Extras y modificadores por producto (término, extras, sin…). */
  modifiers?: boolean;
  /** El menú del restaurante lo arman las RECETAS, no el catálogo completo. */
  restaurant_menu_recipes?: boolean;
  /** Menú digital con QR: página pública que el cliente abre desde la mesa. */
  digital_menu?: boolean;
  /** Ventanita: mostrador con número de orden, bipper y fila de despacho. */
  window_service?: boolean;
  /**
   * Las recetas pueden llevar INVENTARIO.
   *
   * Apagado, el plato se crea siempre con stock infinito: el negocio tiene carta
   * y cobro, pero no existencias. Es lo que quiere una ventanita de comidas, y
   * lo que separa un plan básico de uno con control de insumos.
   */
  recipe_inventory?: boolean;
  // ── Recetas avanzadas (todas dentro de Restaurante, todas sobre `recipes`) ──
  // Cada una se activa por separado a propósito: tocan inventario y costos, así
  // que encenderlas de golpe le cambiaría los números a un negocio que ya opera.
  /** Unidades de medida y conversión en el costeo (g ↔ kg, ml ↔ l…). */
  recipe_units?: boolean;
  /** Vender un plato descuenta los INGREDIENTES de su receta. */
  recipe_consumption?: boolean;
  /** Congela el costo en cada venta (food cost histórico real). */
  recipe_cost_history?: boolean;
  /** Los extras consumen ingredientes y tienen costo propio. */
  recipe_modifier_cost?: boolean;
  /** La comanda se rutea por la estación de cocina de la receta. */
  recipe_stations?: boolean;
  /** Producción de subrecetas por lote (hacer 5 L de salsa). */
  recipe_production?: boolean;
  /** Análisis de menú: estrella / vaca / enigma / perro. */
  recipe_menu_engineering?: boolean;
  /** Portal del contador: acceso de solo lectura a la información contable. */
  accountant_portal?: boolean;
  /** Panel de negocios: ver y cambiar entre los negocios del grupo. */
  businesses_panel?: boolean;
  /** Solicitudes de demo: el vendedor pide pruebas con módulos elegidos. */
  demo_requests?: boolean;
  /** Seguimiento de clientes interesados: del primer contacto hasta la venta. */
  crm_leads?: boolean;
  /** Garantías: casos de producto defectuoso, con seguimiento y fotos. */
  warranties?: boolean;
  /** Descarga de la factura en PDF tamaño A4 desde el cobro. */
  invoice_pdf_a4?: boolean;
  /** Kits de productos: combos que descuentan el stock de sus componentes. */
  inventory_kits?: boolean;
  /** Agentes de venta: alta de agentes, comisiones y su reporte. */
  sales_agents?: boolean;
  /** Nuevo pedido: el agente arma el pedido y lo envía a caja. */
  agent_orders?: boolean;
  /** Caja: bandeja de pedidos + apertura/cierre y cobro. */
  cashier_desk?: boolean;
  /** Agenda: asignar día al pedido y trabajar la bandeja por día. */
  agent_agenda?: boolean;
  /** Devoluciones de venta (parciales) y anulación de facturas. */
  returns?: boolean;
  /** Devoluciones al proveedor (baja de stock + saldo a favor). */
  supplier_returns?: boolean;
  /** App de Android: muestra la pantalla de descarga del APK. */
  android_app?: boolean;
  /** Facturación Electrónica (Hacienda CR) — habilita tab en Settings,
   *  dropdown de tipo doc en el POS, y emisión a Hacienda. */
  electronic_invoice?: boolean;
  /** POS Electrónico — terminal dedicada de facturación electrónica. */
  fe_pos?: boolean;
  /** Modo Kiosk con PIN — habilita el toggle en Settings + modal de PIN
   *  en el POS para alternar entre cajeros sin re-loguearse. */
  pos_kiosk?: boolean;
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
  pos_usd: false,
  pos_delivery: false,
  inventory_products_only: false,
  // Por defecto, todos los planes permiten mezclar productos con stock
  // tracked + stock infinito. Si algún plan futuro quiere bloquearlo, basta
  // con poner explícitamente `false` en su configuración de features.
  inventory_mixed_stock: true,
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
  report_taxes: true,
  report_vouchers: true,
  users_roles: false,
  users_teams: false,
  users_shifts: false,
  users_activity: false,
  multi_branch: false,
  multi_branch_transfers: false,
  expenses: false,
  purchases: false,
  accounts_payable: false,
  accounts_receivable: false,
  exclude_from_close: false,
  proformas: false,
  recipes: false,
  hr: false,
  customers: true,
  distribution: true,
  tracking: false,
  live_team: false,
  promotions: false,
  labels: false,
  tables: false,
  table_orders: false,
  modifiers: false,
  restaurant_menu_recipes: false,
  digital_menu: false,
  window_service: false,
  recipe_inventory: false,
  // Recetas avanzadas: todas apagadas. Encienden inventario y costos, así que
  // «no configurado» tiene que significar apagado.
  recipe_units: false,
  recipe_consumption: false,
  recipe_cost_history: false,
  recipe_modifier_cost: false,
  recipe_stations: false,
  recipe_production: false,
  recipe_menu_engineering: false,
  crm_leads: false,
  demo_requests: false,
  accountant_portal: false,
  businesses_panel: false,
  warranties: false,
  invoice_pdf_a4: false,
  inventory_kits: false,
  sales_agents: false,
  agent_orders: false,
  cashier_desk: false,
  agent_agenda: false,
  returns: false,
  supplier_returns: false,
  android_app: false,
  restaurant: false,
  electronic_invoice: false,
  fe_pos: false,
  pos_kiosk: false,
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
  pos_usd: true,
  pos_delivery: true,
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
  report_taxes: true,
  report_vouchers: true,
  users_roles: true,
  users_teams: true,
  users_shifts: true,
  users_activity: true,
  multi_branch: true,
  multi_branch_transfers: true,
  expenses: true,
  purchases: true,
  accounts_payable: true,
  accounts_receivable: true,
  exclude_from_close: true,
  proformas: true,
  recipes: true,
  hr: true,
  customers: true,
  distribution: true,
  tracking: true,
  live_team: true,
  promotions: true,
  labels: true,
  tables: true,
  table_orders: true,
  restaurant_menu_recipes: true,
  digital_menu: true,
  window_service: true,
  recipe_inventory: true,
  recipe_units: true,
  recipe_consumption: true,
  recipe_cost_history: true,
  recipe_modifier_cost: true,
  recipe_stations: true,
  recipe_production: true,
  recipe_menu_engineering: true,
  modifiers: true,
  crm_leads: true,
  demo_requests: true,
  accountant_portal: true,
  businesses_panel: true,
  warranties: true,
  invoice_pdf_a4: true,
  inventory_kits: true,
  sales_agents: true,
  agent_orders: true,
  cashier_desk: true,
  agent_agenda: true,
  returns: true,
  supplier_returns: true,
  android_app: true,
  restaurant: true,
  electronic_invoice: true,
  fe_pos: true,
  pos_kiosk: true,
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
  /** Actualiza en memoria el alias de ticket del usuario logueado. */
  updateAlias: (alias: string) => void;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshPlan: (tenantId: string) => Promise<void>;
  // ── Multi-sucursal ────────────────────────────────────────────────────
  branches: BranchLite[];
  currentBranchId: string | null;
  switchBranch: (branchId: string) => void;
  reloadBranches: () => Promise<void>;
  // ── Modo solo-lectura por morosidad (>15 días vencido) ────────────────
  /** True cuando el tenant está suspendido por morosidad pero aún puede ver. */
  isReadOnly: boolean;
  // ── Sesión abierta SIN internet ───────────────────────────────────────
  /** La sesión se abrió offline, volvió la conexión y hace falta la contraseña
   *  para obtener el token real (la app se recargó y se perdió de memoria). */
  needsReauth: boolean;
  /** Convierte la sesión offline en una real. Sin argumento usa la contraseña
   *  que quedó en memoria; con argumento, la que escriba el usuario. */
  reauthenticate: (password?: string) => Promise<boolean>;
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
    'repartidor': 'Repartidor',
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
  // Módulos personalizados por empresa (override sobre el plan). Se mantienen
  // aparte para que ningún otro setPlanFeatures (cache/refresh) los pise.
  const [featureOverrides, setFeatureOverrides] = useState<Partial<PlanFeatures>>({});

  // Cargar los overrides cada vez que cambia el tenant activo.
  useEffect(() => {
    const tid = tenant?.id;
    if (!tid) { setFeatureOverrides({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await apiFetch<any>('/settings/feature-overrides').catch(() => null);
        if (cancelled) return;
        const ov = cfg?.config ?? cfg;
        setFeatureOverrides(ov && typeof ov === 'object' && !Array.isArray(ov) ? ov : {});
      } catch { if (!cancelled) setFeatureOverrides({}); }
    })();
    return () => { cancelled = true; };
  }, [tenant?.id]);
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
      const toTenant = (raw: any): Tenant => ({
        ...raw,
        subscription: Array.isArray(raw.subscription) ? raw.subscription[0] ?? null : raw.subscription ?? null,
      });

      // ── 1. Intento usar la nueva RPC `my_tenants` (multi-empresa real
      //    vía user_tenants). Devuelve todos los tenants accesibles para el
      //    user actual, sin importar si es owner directo o staff invitado.
      let allTenants: Tenant[] = [];
      try {
        const { data: mt, error: mtErr } = await supabase.rpc('my_tenants');
        if (!mtErr && Array.isArray(mt) && mt.length > 0) {
          // Hidratar con la info completa (subscription + plan)
          const ids = mt.map((r: any) => r.tenant_id);
          const { data: full } = await supabase
            .from('tenants')
            .select(TENANT_SELECT)
            .in('id', ids);
          allTenants = (full ?? []).map(toTenant);
        }
      } catch { /* RPC no existe aún o falló — sigo al fallback */ }

      // ── 2. Fallback al método viejo (owner_id) si la RPC no respondió.
      if (allTenants.length === 0) {
        const { data: ownedTenants } = await supabase
          .from('tenants')
          .select(TENANT_SELECT)
          .eq('owner_id', userId);
        allTenants = (ownedTenants ?? []).map(toTenant);
      }

      // ── 3. Si tampoco hay nada como owner pero el user tiene tenant_id
      //    (staff/cajero invitado), traer ese tenant individual.
      let resolvedTenant: Tenant | null = null;
      if (allTenants.length > 0) {
        resolvedTenant = allTenants.find(t => t.id === userTenantId) ?? allTenants[0];
      } else if (userTenantId) {
        const { data: staffTenant } = await supabase
          .from('tenants')
          .select(TENANT_SELECT)
          .eq('id', userTenantId)
          .maybeSingle();
        resolvedTenant = staffTenant ? toTenant(staffTenant) : null;
      }

      const planData = extractPlanData(resolvedTenant, DEFAULT_FEATURES);
      return { tenants: allTenants, selectedTenant: resolvedTenant, planData };
    } catch {
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
        .select('id, email, tenant_id, role, full_name, business_name, ticket_alias')
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
      // Si el tenant por defecto es una SUCURSAL sin suscripción propia, el cliente
      // no puede leer el plan del grupo por RLS → quedaría en 'demo'. Pedimos el
      // plan (heredado del tenant principal) al backend con service-role.
      if (planData.name === 'demo' && selectedTenant) {
        try {
          const { apiFetch } = await import('@/lib/api');
          const p = await apiFetch<{ name: string; features: Partial<PlanFeatures> | null }>(`/tenant-groups/my/tenant-plan/${selectedTenant.id}`);
          if (p?.features) planData = { name: p.name ?? 'demo', features: { ...DEFAULT_FEATURES, ...p.features } };
        } catch { /* sin conexión: se queda con lo que haya */ }
      }

      if (!isActive()) return;

      setTenants(loadedTenants);
      if (selectedTenant) setTenant(selectedTenant);
      setPlanFeatures(planData.features);
      setPlanName(planData.name);
      // Los módulos personalizados por empresa (feature-overrides) se aplican en
      // un efecto separado y se mergean en el valor del contexto (ver abajo), para
      // que NO los pisen los otros setPlanFeatures (cache, refresh, cambio de tenant).

      // Identificar al usuario en Sentry — cualquier error futuro queda
      // taggeado con su email y tenant. No-op si Sentry no fue iniciado.
      try {
        identifySentryUser({
          id: userData.id,
          email: userData.email,
          full_name: userData.full_name,
          tenant_id: selectedTenant?.id,
        });
      } catch { /* no romper auth si Sentry falla */ }

      // Persist to localStorage so next load works offline
      writeAuthCache({
        userId,
        user: userData,
        tenant: selectedTenant,
        tenants: loadedTenants,
        planFeatures: planData.features,
        planName: planData.name,
      });


      // Persistir tenant id para que el fallback offline de apiFetch pueda
      // encontrar el cache (que está namespaced por tenant).
      if (selectedTenant) {
        try { localStorage.setItem('novapos_current_tenant_id', selectedTenant.id); } catch {}
      }

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
      /**
       * Si hay datos guardados de ESTE mismo usuario, la sesión no se cierra.
       *
       * Antes solo se perdonaban los errores de red: cualquier otro tropiezo
       * —un 500 del servidor, una consulta que devuelve error un instante, un
       * corte de medio segundo que no llega a marcarse como «sin conexión»—
       * cerraba la sesión y echaba al cajero a la pantalla de login en plena
       * venta. El token de Supabase seguía siendo válido; el problema era
       * pasajero y el sistema reaccionaba como si el usuario ya no existiera.
       *
       * Con caché propia se sigue trabajando y se reintenta en la próxima
       * carga. Cerrar la sesión queda para cuando de verdad no hay con qué
       * seguir: otro usuario, o ninguna copia guardada.
       */
      const cache = readAuthCache();
      if (cache && cache.userId === userId) {
        setUser(cache.user);
        setTenant(cache.tenant);
        setTenants(cache.tenants);
        setPlanFeatures(cache.planFeatures);
        setPlanName(cache.planName);
        // El aviso solo si NO fue la red: un corte no es algo que el usuario
        // tenga que resolver, pero un error del servidor conviene verlo.
        setError(isNetworkError(err) ? null : errorMsg);
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

      // `getSession()` puede quedarse colgado: si el refresh_token venció, el SDK
      // sale a la red y en un celular con la red intermitente no vuelve nunca.
      // Sin este tope, `loading` se quedaba en true para siempre y la app no
      // pasaba del arranque. Al vencerse, se sigue como si no hubiera sesión: el
      // rescate offline de abajo y el login normal cubren el resto.
      const session = await Promise.race([
        supabase.auth.getSession().then(r => r.data.session).catch(() => null),
        new Promise<null>(res => setTimeout(() => res(null), 8000)),
      ]);

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

    // OJO: acá NO se renueva la sesión a la fuerza.
    //
    // Antes había un temporizador que llamaba a `refreshSession()` cada 30
    // minutos aunque el token estuviera perfecto. Cada renovación ROTA el token
    // de refresco: el anterior queda muerto. Con dos pestañas abiertas —o la
    // caja y la app del repartidor— dos renovaciones se pisaban, la que perdía
    // se quedaba con un token muerto y Supabase cerraba la sesión. Eso es «se
    // sale solo»: nadie tocó nada, se cayó por renovar de más.
    //
    // El cliente ya trae `autoRefreshToken`, que renueva cuando de verdad falta
    // poco. Ese es el único que debe hacerlo.

    return () => {
      mounted = false;
      subscription?.unsubscribe();
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

    // Reset del timestamp de login para el timeout de sesión por edad.
    try { localStorage.setItem(SESSION_LOGIN_TS_KEY, String(Date.now())); }
    catch { /* SSR */ }

    const email = emailOrUsername.includes('@')
      ? emailOrUsername
      : `${emailOrUsername}@nexoerp.local`;

    try {
      // TIMEOUT: sin internet, signInWithPassword puede quedarse colgado (reintenta
      // internamente) y nunca lanzar. Sin este corte el login se quedaba girando y
      // NUNCA llegaba al camino offline. 12 s es de sobra para una red buena.
      const TIMEOUT_MS = 12_000;
      const intentar = async () => {
        const signIn = supabase.auth.signInWithPassword({ email, password });
        return Promise.race([
          signIn.then(r => ({ kind: 'done' as const, r })),
          new Promise<{ kind: 'timeout' }>(res => setTimeout(() => res({ kind: 'timeout' }), TIMEOUT_MS)),
        ]);
      };

      // UN reintento antes de rendirse. El primer login del día suele caer en un
      // servidor "frío" y tardar más de la cuenta; fallar en ese caso deja al
      // usuario convencido de que sus credenciales no sirven.
      const t0 = Date.now();
      let timed = await intentar();
      if (timed.kind === 'timeout' && navigator.onLine) {
        console.warn(`[auth] el login no respondió en ${Math.round((Date.now() - t0) / 1000)} s: reintentando`);
        timed = await intentar();
      }
      if (timed.kind === 'timeout') {
        // La respuesta no llegó, pero el login PUDO haber funcionado: Supabase
        // suele dejar la sesión creada aunque la respuesta se pierda o llegue
        // tarde. Antes de dar el error se pregunta si ya hay sesión — así el
        // usuario entra en vez de ver "tiempo de espera agotado" con las
        // credenciales correctas.
        const { data: ya } = await supabase.auth.getSession();
        if (ya?.session?.user) {
          console.info('[auth] el login respondió tarde, pero la sesión ya existía');
          return;   // handleSession se dispara con el evento SIGNED_IN
        }

        setError(navigator.onLine
          ? 'El servidor está tardando en responder. Esperá unos segundos y volvé a intentar.'
          : 'Sin conexión a internet. Conectate y volvé a intentar.');
        setLoading(false);
        throw new Error('Tiempo de espera agotado al iniciar sesión');
      }
      const { error: signInError } = timed.r;

      if (signInError) {
        // Sin internet (o Supabase inalcanzable): intentar el LOGIN OFFLINE con el
        // verificador local. Solo aplica a errores de RED — una contraseña mala
        // online sigue fallando igual.
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

  /**
   * Reautenticación: quedó como API vacía.
   *
   * Existía para convertir una sesión OFFLINE en una real cuando volvía el
   * internet. Sin login offline no hay nada que convertir: o hay token de
   * Supabase, o el usuario está en la pantalla de login. Se conserva la forma
   * para no romper a quien la consume.
   */
  const [needsReauth] = useState(false);
  const reauthenticate = useCallback(async (_password?: string): Promise<boolean> => true, []);

  // ============================================
  // LOGOUT
  // ============================================

  const logout = async () => {
    try {
      setError(null);
      setLoading(true);

      // Limpiamos cualquier rastro del modo solo-lectura antes de salir, así
      // el próximo usuario que entre desde este navegador no hereda el bloqueo.
      try { localStorage.removeItem('novapos_read_only'); } catch { /* ignore */ }
      // Limpiamos el timestamp del login para el timeout de sesión por edad.
      try { localStorage.removeItem(SESSION_LOGIN_TS_KEY); } catch { /* ignore */ }

      // Limpiamos también la identidad en Sentry para que errores post-logout
      // no queden taggeados con el usuario anterior.
      try { clearSentryUser(); } catch { /* ignore */ }

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

      let selectedTenant = tenants.find(t => t.id === tenantId);
      // La lista local (`my_tenants`) puede no incluir TODAS las sucursales del
      // grupo (bug: con varias sucursales, al "Entrar" fallaba con "Tenant not
      // found" y no cargaba). Si no está, la traemos directo y la agregamos.
      if (!selectedTenant) {
        const { data: raw } = await supabase
          .from('tenants').select(TENANT_SELECT).eq('id', tenantId).maybeSingle();
        if (raw) {
          selectedTenant = {
            ...(raw as any),
            subscription: Array.isArray((raw as any).subscription)
              ? (raw as any).subscription[0] ?? null
              : (raw as any).subscription ?? null,
          } as Tenant;
          setTenants(prev => (prev.some(t => t.id === tenantId) ? prev : [...prev, selectedTenant as Tenant]));
        }
      }
      if (!selectedTenant) throw new Error('Tenant not found');

      if (user) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ tenant_id: tenantId })
          .eq('id', user.id);

        if (updateError) throw updateError;

        setUser({ ...user, tenant_id: tenantId });
        setTenant(selectedTenant);

        // Plan de la sucursal: RLS impide leer la suscripción de OTRO tenant desde
        // el cliente (devolvía 'demo' → plan incorrecto, sobre todo con varias
        // sucursales). Lo pedimos al backend (service-role); si falla, caemos al
        // join local del tenant.
        try {
          const { apiFetch } = await import('@/lib/api');
          const p = await apiFetch<{ name: string; features: Partial<PlanFeatures> | null }>(`/tenant-groups/my/tenant-plan/${tenantId}`);
          if (p?.features) {
            setPlanFeatures({ ...DEFAULT_FEATURES, ...p.features });
            setPlanName(p.name ?? 'demo');
          } else {
            const pd = extractPlanData(selectedTenant, DEFAULT_FEATURES);
            setPlanFeatures(pd.features); setPlanName(pd.name);
          }
        } catch {
          const pd = extractPlanData(selectedTenant, DEFAULT_FEATURES);
          setPlanFeatures(pd.features); setPlanName(pd.name);
        }
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

  // Modo solo-lectura: tenant suspendido por morosidad O suscripción vencida
  // hace más de 6 días de gracia. Permite entrar (ver) pero todas las
  // mutaciones quedan deshabilitadas (igual que el bloqueo del backend).
  const GRACE_DAYS = 6;
  const subEndsAt = tenant?.subscription?.ends_at;
  const isExpiredBeyondGrace = (() => {
    if (!subEndsAt) return false;
    const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
    return new Date(subEndsAt).getTime() + graceMs < Date.now();
  })();
  const isReadOnly = tenant?.status === 'suspended' || isExpiredBeyondGrace;

  // Persistir el flag para que apiFetch lo lea desde cualquier servicio sin
  // necesidad de pasarle el contexto. Se limpia al cambiar de tenant o estado.
  useEffect(() => {
    try {
      if (isReadOnly) localStorage.setItem('novapos_read_only', '1');
      else            localStorage.removeItem('novapos_read_only');
    } catch { /* SSR / privacidad — ignorar */ }
  }, [isReadOnly]);

  // ── Vencimiento de sesión: UNA VEZ AL DÍA ───────────────────────────────
  // Cada N minutos revisa si ya pasó el corte de madrugada correspondiente a
  // este login. Si el usuario no tenía marca de tiempo (caché viejo), se pone
  // ahora para no echarlo de inmediato.
  useEffect(() => {
    if (!user) return;
    try {
      if (!localStorage.getItem(SESSION_LOGIN_TS_KEY)) {
        localStorage.setItem(SESSION_LOGIN_TS_KEY, String(Date.now()));
      }
    } catch { /* SSR */ }

    const check = () => {
      try {
        const raw = localStorage.getItem(SESSION_LOGIN_TS_KEY);
        if (!raw) return;
        const loginTs = Number(raw);
        if (Number.isFinite(loginTs) && Date.now() >= sessionExpiresAt(loginTs)) {
          console.log('[auth] sesión vencida (corte diario) — cerrando y limpiando cache');
          clearAllAppCache();
          logout().catch(() => {});
        }
      } catch { /* ignore */ }
    };

    // Chequear ya y cada SESSION_CHECK_INTERVAL_MS
    check();
    const id = window.setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Features efectivas = plan base + overrides por empresa (los overrides mandan).
  const mergedPlanFeatures = useMemo(() => {
    const f = { ...planFeatures, ...featureOverrides } as PlanFeatures;
    // Compatibilidad: los planes viejos solo traen `sales_agents` y ahí adentro
    // venían caja, nuevo pedido y agenda. Si el flag nuevo no está definido,
    // hereda; si está definido (aunque sea en false), manda el flag nuevo.
    if (f.sales_agents) {
      f.agent_orders ??= true;
      f.cashier_desk ??= true;
      f.agent_agenda ??= true;
    }
    return f;
  }, [planFeatures, featureOverrides]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        tenants,
        planFeatures: mergedPlanFeatures,
        planName,
        loading,
        error,
        login,
        logout,
        clearError,
        getRoleLabel,
        updateAlias: (alias: string) => setUser(u => (u ? { ...u, ticket_alias: alias } : u)),
        switchTenant,
        refreshPlan,
        branches,
        currentBranchId,
        switchBranch,
        reloadBranches,
        isReadOnly,
        needsReauth,
        reauthenticate,
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
