import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, TrendingUp, AlertTriangle,
  ArrowUpRight, Package, BarChart2, Settings, Users,
  Clock, CheckCircle, XCircle, TrendingDown, Wallet,
  ClipboardList, Tag, CalendarClock, Zap, Wifi, WifiOff,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import type { PlanFeatures } from '@/context/AuthContext';
import { qzConnect, qzIsConnected } from '@/services/pos/qzTrayService';
import { KpiCard } from './components/KpiCard';
import { AlertItem } from './components/AlertItem';
import { QuickTile } from './components/QuickTile';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function greeting(name?: string) {
  const h      = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return name ? `${saludo}, ${name.split(' ')[0]}` : saludo;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Stats {
  todayTotal:    number;
  todayCount:    number;
  avgTicket:     number;
  weekTotal:     number;
  lowStockCount: number;
  expensesMonth: number;
  pendingAP:     number;
  overdueAP:     number;
  pendingPurchases: number;
  activePromos:  number;
}

interface DayBar      { label: string; total: number }
interface RecentInvoice {
  id: string; invoice_number: string;
  issued_at: string; total: number;
  payment_method: string; status: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE',
  check: 'Cheque',  transfer: 'Transferencia',
};

// ── Main component ────────────────────────────────────────────────────────────

export const Dashboard = () => {
  const { user, planFeatures, tenant } = useAuth();
  const { tenantId } = useTenantId();
  const navigate     = useNavigate();

  const [stats,     setStats]     = useState<Stats | null>(null);
  const [bars,      setBars]      = useState<DayBar[]>([]);
  const [recent,    setRecent]    = useState<RecentInvoice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [subEndsAt, setSubEndsAt] = useState<string | null>(null);
  const [qzConnected, setQzConnected] = useState(false);

  const pf = planFeatures as PlanFeatures & Record<string, boolean>;

  const hasFullInventory = pf.inventory && !pf.inventory_products_only;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const since    = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const sinceStr = since.toISOString().slice(0, 10);

      // ── Invoices (always needed for POS) ───────────────────────────────────
      const salesResponse = await apiFetch<{ invoices: RecentInvoice[] } | RecentInvoice[]>(
        `/reports/sales?from=${sinceStr}&to=${todayStr}`
      );
      console.log('[Dashboard] salesResponse type:', typeof salesResponse, 'isArray:', Array.isArray(salesResponse));
      const all = Array.isArray(salesResponse) ? salesResponse : (salesResponse?.invoices ?? []);
      console.log('[Dashboard] all:', all, 'isArray:', Array.isArray(all));

      const todayItems  = Array.isArray(all) ? all.filter(r => r.issued_at.startsWith(todayStr)) : [];
      const todayTotal  = todayItems.reduce((s, r) => s + Number(r.total), 0);
      const todayCount  = todayItems.length;
      const weekTotal   = Array.isArray(all) ? all.reduce((s, r) => s + Number(r.total), 0) : 0;

      // 7-day bars
      const dayMap: Record<string, number> = {};
      if (Array.isArray(all)) {
        all.forEach(r => { const k = r.issued_at.slice(0, 10); dayMap[k] = (dayMap[k] ?? 0) + Number(r.total); });
      }
      const barData: DayBar[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        barData.push({ label: DAY_LABELS[d.getDay()], total: dayMap[k] ?? 0 });
      }
      setBars(barData);
      setRecent(Array.isArray(all) ? all.slice(0, 5) : []);

      // ── Low stock (full inventory only) ────────────────────────────────────
      let lowStockCount = 0;
      if (hasFullInventory) {
        const stockResp = await apiFetch<{ low_stock_count: number; products?: Array<{ stock_quantity: number; min_stock_level: number }> }>('/reports/stock');
        lowStockCount = stockResp?.low_stock_count ?? 0;
      }

      // ── Expenses this month ────────────────────────────────────────────────
      let expensesMonth = 0;
      if (pf.expenses) {
        const firstOfMonth = todayStr.slice(0, 7) + '-01';
        const expResp = await apiFetch<{ expenses: Array<{ amount: number }> }>(`/reports/expenses?from=${firstOfMonth}&to=${todayStr}`);
        expensesMonth = (expResp?.expenses ?? []).reduce((s, r) => s + Number(r.amount), 0);
      }

      // ── Accounts payable ───────────────────────────────────────────────────
      let pendingAP = 0, overdueAP = 0;
      if (pf.accounts_payable) {
        try {
          const apRows = await apiFetch<Array<{ status: string }>>('/accounts-payable?status=pending');
          const apArray = Array.isArray(apRows) ? apRows : [];
          pendingAP = apArray.length;
          overdueAP = apArray.filter(r => r.status === 'overdue').length;
        } catch {}
      }

      // ── Pending purchases ──────────────────────────────────────────────────
      let pendingPurchases = 0;
      if (pf.purchases) {
        try {
          const pRows = await apiFetch<Array<{ id: string }>>('/purchases?status=pending');
          pendingPurchases = Array.isArray(pRows) ? pRows.length : 0;
        } catch {}
      }

      // ── Active promotions ──────────────────────────────────────────────────
      let activePromos = 0;
      if (pf.promotions) {
        try {
          const promoRows = await apiFetch<Array<{ id: string }>>('/promotions/active');
          activePromos = Array.isArray(promoRows) ? promoRows.length : 0;
        } catch {}
      }

      // ── Subscription expiry ────────────────────────────────────────────────
      try {
        const subRow = await apiFetch<{ ends_at: string } | null>('/plans/current');
        setSubEndsAt(subRow?.ends_at ?? null);
      } catch {}

      setStats({ todayTotal, todayCount, avgTicket: todayCount > 0 ? todayTotal / todayCount : 0,
        weekTotal, lowStockCount, expensesMonth, pendingAP, overdueAP, pendingPurchases, activePromos });

    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, [tenantId, hasFullInventory, pf.expenses, pf.accounts_payable, pf.purchases, pf.promotions]);

  useEffect(() => { load(); }, [load]);

  // Auto-connect to QZ Tray
  useEffect(() => {
    const connectQZ = async () => {
      try {
        if (qzIsConnected()) {
          setQzConnected(true);
          return;
        }
        await qzConnect();
        setQzConnected(true);
      } catch {
        setQzConnected(false);
      }
    };
    connectQZ();
  }, []);

  // Subscription warning
  const subDaysLeft = (() => {
    if (!subEndsAt) return null;
    const d = subEndsAt.includes('T') ? new Date(subEndsAt) : new Date(subEndsAt + 'T00:00:00');
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  })();
  const showSubBanner = subDaysLeft !== null && subDaysLeft <= 15;

  const spin = loading ? '—' : undefined;
  const v    = (n: number) => spin ?? fmt(n);
  const vn   = (n: number) => spin ?? String(n);

  // ── Quick access tiles (only enabled features) ────────────────────────────
  const tiles = [
    { feature: 'pos',              label: 'Punto de Venta',    desc: 'Cobrar a clientes',     icon: ShoppingCart,  path: '/pos',              color: 'bg-emerald-500', bg: 'bg-emerald-50'  },
    { feature: 'inventory',        label: 'Inventario',        desc: 'Productos y stock',      icon: Package,       path: '/inventory',        color: 'bg-blue-500',   bg: 'bg-blue-50'    },
    { feature: 'promotions',       label: 'Promociones',       desc: 'Ofertas del día',        icon: Tag,           path: '/promotions',       color: 'bg-violet-500', bg: 'bg-violet-50'  },
    { feature: 'expenses',         label: 'Gastos',            desc: 'Registrar egresos',      icon: TrendingDown,  path: '/expenses',         color: 'bg-red-400',    bg: 'bg-red-50'     },
    { feature: 'purchases',        label: 'Órdenes de Compra', desc: 'Pedidos a proveedores',  icon: ClipboardList, path: '/purchases',        color: 'bg-cyan-500',   bg: 'bg-cyan-50'    },
    { feature: 'accounts_payable', label: 'Cuentas por Pagar', desc: 'Pagos a proveedores',    icon: Wallet,        path: '/accounts-payable', color: 'bg-rose-500',   bg: 'bg-rose-50'    },
    { feature: 'reports',          label: 'Reportes',          desc: 'Analítica de ventas',    icon: BarChart2,     path: '/reports',          color: 'bg-indigo-500', bg: 'bg-indigo-50'  },
    { feature: 'users',            label: 'Usuarios',          desc: 'Equipo y roles',         icon: Users,         path: '/users',            color: 'bg-amber-500',  bg: 'bg-amber-50'   },
    { feature: 'settings',         label: 'Configuración',     desc: 'Ajustes del negocio',    icon: Settings,      path: '/settings',         color: 'bg-gray-600',   bg: 'bg-gray-100'   },
  ].filter(t => t.feature === 'settings' || (pf[t.feature as keyof PlanFeatures] ?? false));

  // ── Alerts (items needing attention) ─────────────────────────────────────
  const alerts: Array<{ color: string; icon: any; text: string; path: string }> = [];

  if (stats) {
    if (hasFullInventory && stats.lowStockCount > 0)
      alerts.push({ color: 'bg-amber-50 border-amber-200 text-amber-800', icon: AlertTriangle, text: `${stats.lowStockCount} producto${stats.lowStockCount !== 1 ? 's' : ''} con stock bajo`, path: '/inventory' });
    if (pf.accounts_payable && stats.overdueAP > 0)
      alerts.push({ color: 'bg-red-50 border-red-200 text-red-700', icon: Wallet, text: `${stats.overdueAP} cuenta${stats.overdueAP !== 1 ? 's' : ''} por pagar vencida${stats.overdueAP !== 1 ? 's' : ''}`, path: '/accounts-payable' });
    if (pf.purchases && stats.pendingPurchases > 0)
      alerts.push({ color: 'bg-blue-50 border-blue-200 text-blue-700', icon: ClipboardList, text: `${stats.pendingPurchases} orden${stats.pendingPurchases !== 1 ? 'es' : ''} de compra pendiente${stats.pendingPurchases !== 1 ? 's' : ''}`, path: '/purchases' });
    if (pf.promotions && stats.activePromos > 0)
      alerts.push({ color: 'bg-violet-50 border-violet-200 text-violet-700', icon: Zap, text: `${stats.activePromos} promoción${stats.activePromos !== 1 ? 'es' : ''} activa${stats.activePromos !== 1 ? 's' : ''} hoy`, path: '/promotions' });
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Subscription expiry banner ────────────────────────────────────── */}
      {showSubBanner && (
        <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 border ${
          subDaysLeft! < 0
            ? 'bg-red-50 border-red-200 text-red-800'
            : subDaysLeft! <= 7
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <CalendarClock size={20} className="shrink-0" />
          <div className="flex-1">
            <p className="font-black text-sm">
              {subDaysLeft! < 0
                ? `Tu suscripción venció hace ${Math.abs(subDaysLeft!)} día${Math.abs(subDaysLeft!) !== 1 ? 's' : ''}`
                : subDaysLeft === 0
                ? 'Tu suscripción vence hoy'
                : `Tu suscripción vence en ${subDaysLeft} día${subDaysLeft !== 1 ? 's' : ''}`}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              Contactá al administrador para renovarla a tiempo y no perder acceso.
            </p>
          </div>
        </div>
      )}

      {/* ── QZ Tray connection warning ────────────────────────────────────── */}
      {!qzConnected && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-4 border bg-amber-50 border-amber-200 text-amber-800">
          <WifiOff size={20} className="shrink-0" />
          <div className="flex-1">
            <p className="font-black text-sm">QZ Tray no disponible</p>
            <p className="text-xs mt-0.5 opacity-80">
              La conexión con la impresora térmica no se pudo establecer. Ve a <button onClick={() => navigate('/settings')} className="underline font-semibold hover:opacity-60">Configuración</button> para conectar.
            </p>
          </div>
          <Wifi size={20} className="shrink-0 opacity-30" />
        </div>
      )}

      {/* ── Hero greeting ─────────────────────────────────────────────────── */}
      <div className="bg-linear-to-br from-emerald-600 via-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-emerald-200 text-sm font-medium mb-1 capitalize">
              {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-3xl font-black tracking-tight leading-tight">
              {greeting(user?.full_name || user?.email)}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {tenant && <p className="text-emerald-200 text-sm">{tenant.name}</p>}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-white/15 rounded-xl px-4 py-3 text-center min-w-24">
              <p className="text-xs text-emerald-100 font-semibold">Hoy</p>
              <p className="text-2xl font-black mt-0.5">{loading ? '—' : fmt(stats?.todayTotal ?? 0)}</p>
              <p className="text-xs text-emerald-200">{loading ? '' : `${stats?.todayCount ?? 0} factura${stats?.todayCount !== 1 ? 's' : ''}`}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3 text-center min-w-24">
              <p className="text-xs text-emerald-100 font-semibold">Esta semana</p>
              <p className="text-2xl font-black mt-0.5">{loading ? '—' : fmt(stats?.weekTotal ?? 0)}</p>
              <p className="text-xs text-emerald-200">7 días</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs (adaptive) ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={ShoppingCart} label="Facturas hoy"
          value={vn(stats?.todayCount ?? 0)} sub={`Ticket promedio: ${loading ? '—' : fmt(stats?.avgTicket ?? 0)}`} color="bg-blue-500" />
        <KpiCard icon={TrendingUp}   label="Ticket promedio"
          value={v(stats?.avgTicket ?? 0)} color="bg-violet-500" />
        {hasFullInventory && (
          <KpiCard icon={AlertTriangle} label="Bajo stock"
            value={vn(stats?.lowStockCount ?? 0)} sub="productos" color={(stats?.lowStockCount ?? 0) > 0 ? 'bg-amber-500' : 'bg-gray-400'}
            onClick={() => navigate('/inventory')} />
        )}
        {pf.expenses && (
          <KpiCard icon={TrendingDown} label="Gastos del mes"
            value={v(stats?.expensesMonth ?? 0)} color="bg-red-400" onClick={() => navigate('/expenses')} />
        )}
        {pf.accounts_payable && (
          <KpiCard icon={Wallet} label="Cuentas por pagar"
            value={vn(stats?.pendingAP ?? 0)} sub={(stats?.overdueAP ?? 0) > 0 ? `${stats?.overdueAP} vencida${(stats?.overdueAP ?? 0) !== 1 ? 's' : ''}` : 'al día'}
            color={(stats?.overdueAP ?? 0) > 0 ? 'bg-red-500' : 'bg-rose-400'} onClick={() => navigate('/accounts-payable')} />
        )}
        {pf.promotions && (
          <KpiCard icon={Tag} label="Promos activas hoy"
            value={vn(stats?.activePromos ?? 0)} color={(stats?.activePromos ?? 0) > 0 ? 'bg-violet-600' : 'bg-gray-400'}
            onClick={() => navigate('/promotions')} />
        )}
      </div>

      {/* ── Alerts strip ─────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Necesita atención</p>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a, i) => (
              <AlertItem key={i} {...a} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* ── Quick access + chart ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick access */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Acceso rápido</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
            {tiles.slice(0, 6).map(t => (
              <QuickTile key={t.feature} {...t} onClick={() => navigate(t.path)} />
            ))}
          </div>
          {tiles.length > 6 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 mt-3">
              {tiles.slice(6).map(t => (
                <QuickTile key={t.feature} {...t} onClick={() => navigate(t.path)} />
              ))}
            </div>
          )}
        </div>

        {/* 7-day chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900">Ingresos — últimos 7 días</h2>
            {pf.reports && (
              <button onClick={() => navigate('/reports')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition">
                Ver reporte <ArrowUpRight size={13} />
              </button>
            )}
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
            </div>
          ) : bars.every(b => b.total === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2">
              <BarChart2 size={32} className="text-gray-200" />
              <p className="text-gray-400 text-sm">Sin ventas en los últimos 7 días</p>
              {pf.pos && (
                <button onClick={() => navigate('/pos')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition mt-1">
                  <ShoppingCart size={14} /> Ir al POS
                </button>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bars} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(Number(v)/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(v: unknown) => [fmt(Number(v)), 'Total']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                  cursor={{ fill: '#f0fdf4' }}
                />
                <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Recent invoices ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Facturas recientes</h2>
          {pf.reports && (
            <button onClick={() => navigate('/reports')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition">
              Ver todas <ArrowUpRight size={13} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <ShoppingCart size={32} className="text-gray-200" />
            <p className="text-gray-400 text-sm font-medium">Sin facturas en los últimos 7 días</p>
            {pf.pos && (
              <button onClick={() => navigate('/pos')}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition">
                <ShoppingCart size={14} /> Empezar a vender
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-wide">Factura</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Hora</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Método</th>
                  <th className="text-right py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                    <td className="py-3.5 px-6 font-mono font-bold text-gray-800">{inv.invoice_number}</td>
                    <td className="py-3.5 px-4 text-gray-500 hidden sm:table-cell">
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} className="text-gray-300" />
                        {new Date(inv.issued_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 hidden md:table-cell">
                      {PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}
                    </td>
                    <td className="py-3.5 px-6 font-black text-gray-900 text-right">{fmt(Number(inv.total))}</td>
                    <td className="py-3.5 px-4 text-center">
                      {inv.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                          <CheckCircle size={11} /> Completada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                          <XCircle size={11} /> Anulada
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
