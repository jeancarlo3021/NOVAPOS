import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign, ShoppingCart, TrendingUp, AlertTriangle,
  ArrowUpRight, ShoppingBag, Package, BarChart2, Settings,
  Users, Clock, CheckCircle, XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function greeting(name?: string) {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return name ? `${saludo}, ${name.split(' ')[0]}` : saludo;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Stats {
  todayTotal: number;
  todayCount: number;
  avgTicket: number;
  lowStockCount: number;
}

interface DayBar { label: string; total: number }

interface RecentInvoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  total: number;
  payment_method: string;
  status: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE',
  check: 'Cheque', transfer: 'Transferencia',
};

// ── sub-components ────────────────────────────────────────────────────────────

const KpiCard = ({
  icon: Icon, label, value, sub, color,
}: { icon: any; label: string; value: string; sub?: string; color: string }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-gray-900 mt-0.5 truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const QuickCard = ({
  icon: Icon, label, description, color, bg, onClick, disabled,
}: { icon: any; label: string; description: string; color: string; bg: string; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`group text-left w-full rounded-2xl border p-5 transition-all duration-150 ${
      disabled
        ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200'
        : `${bg} border-transparent hover:shadow-md hover:-translate-y-0.5 active:translate-y-0`
    }`}
  >
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <p className="font-black text-gray-900 text-sm">{label}</p>
    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    {!disabled && (
      <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-gray-500 group-hover:text-gray-700 transition">
        Abrir <ArrowUpRight size={13} />
      </div>
    )}
  </button>
);

// ── main component ────────────────────────────────────────────────────────────

export const Dashboard = () => {
  const { user, planFeatures, tenant } = useAuth();
  const { tenantId } = useTenantId();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats | null>(null);
  const [bars, setBars] = useState<DayBar[]>([]);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      // Last 7 days range
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const sinceStr = since.toISOString().slice(0, 10);

      // Invoices last 7 days
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, issued_at, total, payment_method, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('issued_at', `${sinceStr}T00:00:00`)
        .order('issued_at', { ascending: false });

      const all = invoices ?? [];

      // Today subset
      const todayItems = all.filter(r => r.issued_at.startsWith(todayStr));
      const todayTotal = todayItems.reduce((s, r) => s + Number(r.total), 0);
      const todayCount = todayItems.length;

      // 7-day bar chart
      const dayMap: Record<string, number> = {};
      all.forEach(r => {
        const k = r.issued_at.slice(0, 10);
        dayMap[k] = (dayMap[k] ?? 0) + Number(r.total);
      });
      const barData: DayBar[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        barData.push({ label: DAY_LABELS[d.getDay()], total: dayMap[k] ?? 0 });
      }
      setBars(barData);

      // Recent 5 invoices (most recent first, already ordered)
      setRecent(all.slice(0, 5));

      // Low stock count
      const { data: lowStockRows } = await supabase
        .from('products')
        .select('id, stock_quantity, min_stock_level')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      const lowStockCount = (lowStockRows ?? []).filter(
        p => p.stock_quantity <= (p.min_stock_level ?? 0)
      ).length;

      setStats({
        todayTotal,
        todayCount,
        avgTicket: todayCount > 0 ? todayTotal / todayCount : 0,
        lowStockCount,
      });
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const val = (v: string) => loading ? '—' : v;

  return (
    <div className="space-y-7 pb-6">

      {/* ── Greeting header ──────────────────────────────────────────────── */}
      <div className="bg-linear-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-emerald-100 text-sm font-medium mb-1">
              {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-3xl font-black tracking-tight">
              {greeting(user?.full_name || user?.email)}
            </h1>
            {tenant && (
              <p className="text-emerald-200 text-sm mt-1">{tenant.name}</p>
            )}
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-2 text-center">
            <p className="text-xs text-emerald-100 font-medium">Ventas hoy</p>
            <p className="text-2xl font-black">
              {loading ? '—' : fmt(stats?.todayTotal ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign} label="Ingresos hoy"
          value={val(fmt(stats?.todayTotal ?? 0))}
          sub={`${stats?.todayCount ?? 0} factura${stats?.todayCount !== 1 ? 's' : ''}`}
          color="bg-emerald-500"
        />
        <KpiCard
          icon={ShoppingCart} label="Facturas hoy"
          value={val(String(stats?.todayCount ?? 0))}
          color="bg-blue-500"
        />
        <KpiCard
          icon={TrendingUp} label="Ticket promedio"
          value={val(fmt(stats?.avgTicket ?? 0))}
          color="bg-violet-500"
        />
        <KpiCard
          icon={AlertTriangle} label="Bajo stock"
          value={val(String(stats?.lowStockCount ?? 0))}
          sub="productos"
          color={stats?.lowStockCount ? 'bg-orange-500' : 'bg-gray-400'}
        />
      </div>

      {/* ── Quick access + chart ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick access */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Acceso rápido</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickCard
              icon={ShoppingBag} label="POS"
              description="Punto de venta"
              color="bg-emerald-500" bg="bg-emerald-50"
              onClick={() => navigate('/pos')}
              disabled={!planFeatures.pos}
            />
            <QuickCard
              icon={Package} label="Inventario"
              description="Productos y stock"
              color="bg-blue-500" bg="bg-blue-50"
              onClick={() => navigate('/inventory')}
              disabled={!planFeatures.inventory}
            />
            <QuickCard
              icon={BarChart2} label="Reportes"
              description="Ventas y análisis"
              color="bg-violet-500" bg="bg-violet-50"
              onClick={() => navigate('/reports')}
              disabled={!planFeatures.reports}
            />
            <QuickCard
              icon={Users} label="Usuarios"
              description="Equipo y roles"
              color="bg-rose-500" bg="bg-rose-50"
              onClick={() => navigate('/users')}
              disabled={!planFeatures.users}
            />
            <QuickCard
              icon={Settings} label="Configuración"
              description="Ajustes del sistema"
              color="bg-gray-600" bg="bg-gray-50"
              onClick={() => navigate('/settings')}
              disabled={!planFeatures.settings}
            />
          </div>
        </div>

        {/* 7-day chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900">Últimos 7 días</h2>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Ingresos</span>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
            </div>
          ) : bars.every(b => b.total === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2">
              <BarChart2 size={32} className="text-gray-200" />
              <p className="text-gray-400 text-sm">Sin ventas en los últimos 7 días</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bars} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(v: any) => [fmt(Number(v)), 'Total']}
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
          <button
            onClick={() => navigate('/reports')}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition"
            disabled={!planFeatures.reports}
          >
            Ver todas <ArrowUpRight size={13} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <ShoppingCart size={32} className="text-gray-200" />
            <p className="text-gray-400 text-sm">No hay facturas en los últimos 7 días</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-wide">Factura</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Hora</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Método</th>
                  <th className="text-right py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-6 font-mono font-bold text-gray-800">{inv.invoice_number}</td>
                    <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-gray-300" />
                        {new Date(inv.issued_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 hidden md:table-cell">
                      {PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}
                    </td>
                    <td className="py-3 px-6 font-black text-gray-900 text-right">{fmt(inv.total)}</td>
                    <td className="py-3 px-4 text-center">
                      {inv.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle size={11} /> Completada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
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
