import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, AlertTriangle, Package, BarChart2, Settings, Users,
  TrendingDown, Wallet, ClipboardList, Tag, CalendarClock, WifiOff, UserCircle, Truck, PackageCheck, HandCoins,
  Receipt, FileText, Inbox,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import type { PlanFeatures } from '@/context/AuthContext';
import { qzConnect, qzIsConnected } from '@/services/pos/qzTrayService';
import { GroupBranchesPanel } from './components/GroupBranchesPanel';

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

function greeting(name?: string) {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return name ? `${saludo}, ${name.split(' ')[0]}` : saludo;
}

interface QuickStats {
  todayTotal: number;
  todayCount: number;
  lowStockCount: number;
  overdueAP: number;
  pendingPurchases: number;
}

// ── Tiles del menú principal — estilo Eleventa ─────────────────────────────
interface Tile {
  feature: keyof PlanFeatures | 'settings' | 'customers' | 'distribution';
  label: string;
  icon: React.ElementType;
  path: string;
  bg: string; // gradient classes
}

const ALL_TILES: Tile[] = [
  { feature: 'pos',              label: 'Vender',          icon: ShoppingCart,  path: '/pos',              bg: 'from-emerald-500 to-emerald-600' },
  { feature: 'fe_pos',           label: 'POS Electrónico', icon: Receipt,     path: '/fe-pos',           bg: 'from-blue-600 to-indigo-600'      },
  { feature: 'electronic_invoice', label: 'FE Facturas',   icon: FileText,     path: '/fe-facturas',      bg: 'from-sky-500 to-blue-600'         },
  { feature: 'electronic_invoice', label: 'Recepción',     icon: Inbox,        path: '/fe-recepcion',     bg: 'from-indigo-500 to-blue-600'      },
  { feature: 'inventory',        label: 'Inventario',      icon: Package,       path: '/inventory',        bg: 'from-blue-500 to-blue-600'        },
  { feature: 'labels',           label: 'Etiquetas',       icon: Tag,           path: '/labels',           bg: 'from-fuchsia-500 to-purple-600'   },
  { feature: 'reports',          label: 'Reportes',        icon: BarChart2,     path: '/reports',          bg: 'from-indigo-500 to-indigo-600'    },
  { feature: 'expenses',         label: 'Gastos',          icon: TrendingDown,  path: '/expenses',         bg: 'from-rose-500 to-pink-600'        },
  { feature: 'accounts_payable', label: 'Cuentas',         icon: Wallet,        path: '/accounts-payable', bg: 'from-orange-500 to-amber-600'     },
  { feature: 'accounts_receivable', label: 'Por Cobrar',   icon: HandCoins,     path: '/accounts-receivable', bg: 'from-teal-500 to-emerald-600'  },
  { feature: 'purchases',        label: 'Compras',         icon: ClipboardList, path: '/purchases',        bg: 'from-cyan-500 to-sky-600'         },
  { feature: 'promotions',       label: 'Promociones',     icon: Tag,           path: '/promotions',       bg: 'from-violet-500 to-purple-600'    },
  { feature: 'customers',        label: 'Clientes',        icon: UserCircle,    path: '/customers',        bg: 'from-teal-500 to-cyan-600'        },
  { feature: 'distribution',     label: 'Distribución',    icon: Truck,         path: '/distribution',     bg: 'from-cyan-500 to-blue-600'        },
  { feature: 'distribution',     label: 'Repartidor',      icon: PackageCheck,  path: '/driver',           bg: 'from-blue-500 to-indigo-600'      },
  { feature: 'users',            label: 'Usuarios',        icon: Users,         path: '/users',            bg: 'from-fuchsia-500 to-pink-500'     },
  { feature: 'settings',         label: 'Configuración',   icon: Settings,      path: '/settings',         bg: 'from-slate-600 to-slate-700'      },
];

export const Dashboard = () => {
  const { user, planFeatures, tenant } = useAuth();
  const { tenantId } = useTenantId();
  const navigate = useNavigate();

  const pf = planFeatures as PlanFeatures & Record<string, boolean>;
  const hasFullInventory = pf.inventory && !pf.inventory_products_only;

  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [subEndsAt, setSubEndsAt] = useState<string | null>(null);
  const [qzConnected, setQzConnected] = useState(false);
  // Proveedor de FE — la Recepción solo aplica con Alanube.
  const [feProvider, setFeProvider] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantId || isSaasAdmin || !(planFeatures as any)?.electronic_invoice) return;
    import('@/services/hacienda/haciendaService')
      .then(({ haciendaService }) => haciendaService.provider())
      .then(p => setFeProvider(p.provider)).catch(() => {});
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin de SaaS no tiene tenant operativo → los endpoints tipo
  // /accounts-payable, /purchases, /reports devuelven 403 y tardan ~14 s en
  // resolver porque el middleware busca el tenant en Supabase. Detectamos
  // este caso y saltamos las llamadas de stats por completo.
  const isSaasAdmin = (planFeatures as any)?.admin_dashboard === true;

  const load = useCallback(async () => {
    if (!tenantId || isSaasAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Fecha LOCAL de la máquina (NO UTC). Con toISOString, después de las ~18:00
    // en CR (UTC-6) la fecha saltaba al día siguiente y las ventas del día se
    // veían en 0. issued_at se guarda en hora local, así que usamos fecha local.
    const _d = new Date();
    const _p = (x: number) => String(x).padStart(2, '0');
    const todayStr = `${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}`;
    // issued_at es TIMESTAMPTZ: si mandamos solo YYYY-MM-DD el backend
    // interpreta el `to` como medianoche y deja afuera todas las facturas
    // del día. Mandamos timestamps explícitos para cubrir 00:00 → 23:59:59.
    const dayFrom = `${todayStr}T00:00:00`;
    const dayTo   = `${todayStr}T23:59:59.999`;

    // Timeout corto: estas llamadas son OPCIONALES, no deben bloquear el
    // dashboard 20 s si una está lenta o devuelve 403.
    const QUICK_TIMEOUT = 5000;

    // Paralelizamos TODO con Promise.allSettled — una llamada lenta o
    // fallida no atrasa al resto. Antes era secuencial (5×) y bastaba
    // que una se colgara para que el dashboard tardara minutos.
    const callOrSkip = <T,>(
      enabled: boolean,
      path: string,
    ): Promise<T | null> =>
      enabled
        ? apiFetch<T>(path, {}, QUICK_TIMEOUT).catch(() => null as any)
        : Promise.resolve(null);

    const [salesR, stockR, apR, purchR, subR] = await Promise.allSettled([
      callOrSkip<{ total_revenue: number; total_invoices: number; invoices: any[] } | any[]>(
        true,
        `/reports/sales?from=${encodeURIComponent(dayFrom)}&to=${encodeURIComponent(dayTo)}`,
      ),
      callOrSkip<{ low_stock_count: number }>(hasFullInventory, '/reports/stock'),
      callOrSkip<Array<{ status: string }>>(!!pf.accounts_payable, '/accounts-payable?status=pending'),
      callOrSkip<Array<{ id: string }>>(!!pf.purchases, '/purchases?status=pending'),
      callOrSkip<{ ends_at: string } | null>(true, '/plans/current'),
    ]);

    // Ventas — preferimos los totales pre-calculados del backend; si la
    // respuesta vino como array (formato viejo), caemos al cálculo manual.
    let todayTotal = 0, todayCount = 0;
    if (salesR.status === 'fulfilled' && salesR.value) {
      const v = salesR.value as any;
      if (!Array.isArray(v) && typeof v?.total_revenue === 'number') {
        todayTotal = Number(v.total_revenue) || 0;
        todayCount = Number(v.total_invoices ?? (Array.isArray(v.invoices) ? v.invoices.length : 0)) || 0;
      } else {
        const all = Array.isArray(v) ? v : (v?.invoices ?? []);
        todayCount = Array.isArray(all) ? all.length : 0;
        todayTotal = Array.isArray(all)
          ? all.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)
          : 0;
      }
    }

    // Stock
    let lowStockCount = 0;
    if (stockR.status === 'fulfilled' && stockR.value) {
      lowStockCount = (stockR.value as any)?.low_stock_count ?? 0;
    }

    // Cuentas por pagar
    let overdueAP = 0;
    if (apR.status === 'fulfilled' && Array.isArray(apR.value)) {
      overdueAP = (apR.value as any[]).filter(r => r.status === 'overdue').length;
    }

    // Compras pendientes
    let pendingPurchases = 0;
    if (purchR.status === 'fulfilled' && Array.isArray(purchR.value)) {
      pendingPurchases = (purchR.value as any[]).length;
    }

    // Suscripción
    if (subR.status === 'fulfilled' && subR.value) {
      setSubEndsAt((subR.value as any)?.ends_at ?? null);
    }

    setStats({ todayTotal, todayCount, lowStockCount, overdueAP, pendingPurchases });
    setLoading(false);
  }, [tenantId, isSaasAdmin, hasFullInventory, pf.accounts_payable, pf.purchases]);

  useEffect(() => { load(); }, [load]);

  // Auto-conectar a QZ Tray para banner de impresora
  useEffect(() => {
    const connectQZ = async () => {
      try {
        if (qzIsConnected()) { setQzConnected(true); return; }
        await qzConnect();
        setQzConnected(true);
      } catch { setQzConnected(false); }
    };
    connectQZ();
  }, []);

  const subDaysLeft = (() => {
    if (!subEndsAt) return null;
    const d = subEndsAt.includes('T') ? new Date(subEndsAt) : new Date(subEndsAt + 'T00:00:00');
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  })();
  const showSubBanner = subDaysLeft !== null && subDaysLeft <= 15;

  const { canAccess } = useRolePermissions();
  // Solo mostrar tiles habilitados por plan Y por el rol del user.
  // Settings/Configuración pasa por plan + rol (si el owner lo cerró, gerente no la ve).
  const tiles = ALL_TILES.filter(t => {
    // 'settings' siempre; 'customers' visible salvo que se desactive; el resto
    // (incluida Distribución) depende del flag del plan.
    const planHas = t.feature === 'settings'
      || (t.feature === 'customers' ? (pf.customers !== false) : (pf[t.feature as keyof PlanFeatures] ?? false));
    if (!planHas) return false;
    // Recepción de comprobantes: solo con Alanube.
    if (t.path === '/fe-recepcion' && feProvider !== 'alanube') return false;
    // Mapear feature → módulo de role_permissions. Si no hay mapeo, no se gatea.
    const moduleKey = t.feature === 'settings' ? null : t.feature;
    if (!moduleKey) return true;
    return canAccess(moduleKey as string);
  });

  // Si el POS está desactivado, Distribución y Repartidor van de primero.
  if (pf.pos === false) {
    const isDist = (t: Tile) => t.path === '/distribution' || t.path === '/driver';
    tiles.sort((a, b) => Number(isDist(b)) - Number(isDist(a)));
  }

  // Alertas compactas (chips inline en la cabecera, no banner gigante)
  const alertChips: Array<{ icon: any; text: string; path: string; color: string }> = [];
  if (stats) {
    if (hasFullInventory && stats.lowStockCount > 0) {
      alertChips.push({
        icon: AlertTriangle,
        text: `${stats.lowStockCount} con poco stock`,
        path: '/inventory',
        color: 'bg-amber-100 text-amber-800 border-amber-200',
      });
    }
    if (pf.accounts_payable && stats.overdueAP > 0) {
      alertChips.push({
        icon: Wallet,
        text: `${stats.overdueAP} cuenta${stats.overdueAP !== 1 ? 's' : ''} vencida${stats.overdueAP !== 1 ? 's' : ''}`,
        path: '/accounts-payable',
        color: 'bg-red-100 text-red-800 border-red-200',
      });
    }
    if (pf.purchases && stats.pendingPurchases > 0) {
      alertChips.push({
        icon: ClipboardList,
        text: `${stats.pendingPurchases} compra${stats.pendingPurchases !== 1 ? 's' : ''} pendiente${stats.pendingPurchases !== 1 ? 's' : ''}`,
        path: '/purchases',
        color: 'bg-blue-100 text-blue-800 border-blue-200',
      });
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── Hero compacto: saludo + ventas de hoy ────────────────────────── */}
      <div className="bg-linear-to-br from-emerald-600 via-emerald-600 to-teal-700 rounded-2xl px-5 sm:px-6 py-5 text-white shadow-md flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-emerald-200 text-xs font-semibold capitalize">
            {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black leading-tight mt-0.5 truncate">
            {greeting(user?.full_name || user?.email)}
          </h1>
          {tenant && (
            <p className="text-emerald-200 text-sm mt-0.5 truncate">{tenant.name}</p>
          )}
        </div>
        <div className="bg-white/15 rounded-2xl px-5 py-3 text-center min-w-32">
          <p className="text-xs text-emerald-100 font-semibold uppercase tracking-wider">Ventas hoy</p>
          <p className="text-2xl sm:text-3xl font-black mt-0.5 tabular-nums">
            {loading ? '…' : fmt(stats?.todayTotal ?? 0)}
          </p>
          <p className="text-xs text-emerald-200 mt-0.5">
            {loading ? '' : `${stats?.todayCount ?? 0} factura${stats?.todayCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* ── Banners críticos (solo si aplica) ────────────────────────────── */}
      {showSubBanner && (
        <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 border ${
          subDaysLeft! < 0
            ? 'bg-red-50 border-red-200 text-red-800'
            : subDaysLeft! <= 7
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <CalendarClock size={18} className="shrink-0" />
          <p className="font-bold text-sm flex-1">
            {subDaysLeft! < 0
              ? `Suscripción vencida hace ${Math.abs(subDaysLeft!)} día${Math.abs(subDaysLeft!) !== 1 ? 's' : ''}`
              : subDaysLeft === 0
              ? 'Tu suscripción vence hoy'
              : `Tu suscripción vence en ${subDaysLeft} día${subDaysLeft !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}
      {!qzConnected && (
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 rounded-2xl px-5 py-3 border bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 transition text-left"
        >
          <WifiOff size={18} className="shrink-0" />
          <p className="text-sm font-semibold flex-1">
            Impresora térmica desconectada — Toca para configurar
          </p>
        </button>
      )}

      {/* ── Panel multi-empresa: stats por sucursal del grupo ────────────── */}
      <GroupBranchesPanel />

      {/* ── Alertas en chips inline ──────────────────────────────────────── */}
      {alertChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alertChips.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                onClick={() => navigate(a.path)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold text-xs hover:opacity-80 transition ${a.color}`}
              >
                <Icon size={13} />
                {a.text}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Botones gigantes estilo Eleventa ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.path}
              type="button"
              onClick={() => navigate(t.path)}
              className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 text-left bg-linear-to-br ${t.bg} text-white shadow-md hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] transition-all duration-150 min-h-40 sm:min-h-48 flex flex-col justify-between`}
            >
              {/* Decoración suave */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-white/5 blur-xl pointer-events-none" />

              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Icon size={32} strokeWidth={2.2} className="text-white" />
              </div>

              <h3 className="relative text-xl sm:text-2xl font-black leading-tight mt-3">
                {t.label}
              </h3>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
