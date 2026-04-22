import React, { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ShoppingBag, CreditCard, Receipt } from 'lucide-react';
import { useReportsData } from '@/hooks/reports/useReportsData';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981', card: '#3b82f6', sinpe: '#8b5cf6',
  check: '#f59e0b', transfer: '#6b7280',
};
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE',
  check: 'Cheque', transfer: 'Transferencia',
};

function getLast7() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface Props { tenantId: string | null }

export const BasicSalesReport: React.FC<Props> = ({ tenantId }) => {
  const week = getLast7();

  const { summary, loading, fetchSummary } = useReportsData(tenantId);

  useEffect(() => {
    fetchSummary(week.from, week.to);
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaySub = summary
    ? `${summary.todayCount} factura${summary.todayCount !== 1 ? 's' : ''}`
    : '—';

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'Ventas hoy', value: loading ? '—' : fmt(summary?.todayTotal ?? 0), sub: loading ? '' : todaySub, color: 'bg-emerald-500' },
          { icon: ShoppingBag, label: 'Ventas 7 días', value: loading ? '—' : fmt(summary?.periodTotal ?? 0), sub: loading ? '' : `${summary?.periodCount ?? 0} facturas`, color: 'bg-blue-500' },
          { icon: CreditCard, label: 'Ticket promedio', value: loading ? '—' : fmt(summary?.avgTicket ?? 0), color: 'bg-violet-500' },
          { icon: Receipt, label: 'Transacciones', value: loading ? '—' : String(summary?.periodCount ?? 0), sub: 'últimos 7 días', color: 'bg-orange-400' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
              {sub && <p className="text-gray-400 text-xs">{sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Daily bar */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-base font-black text-gray-900 mb-4">Ventas últimos 7 días</h2>
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          </div>
        ) : summary?.dailyStats.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary.dailyStats} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Total']} labelFormatter={(_l, p) => p?.[0]?.payload?.date ?? ''} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} cursor={{ fill: '#f0fdf4' }} />
              <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-12 text-sm">Sin ventas en los últimos 7 días</p>
        )}
      </div>

      {/* Payment breakdown */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-base font-black text-gray-900 mb-4">Métodos de pago</h2>
        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
          </div>
        ) : summary?.paymentStats.length ? (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={summary.paymentStats} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={72} innerRadius={44}>
                  {summary.paymentStats.map(e => (
                    <Cell key={e.method} fill={PAYMENT_COLORS[e.method] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 w-full">
              {summary.paymentStats.map(s => (
                <div key={s.method} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: PAYMENT_COLORS[s.method] ?? '#94a3b8' }} />
                    <span className="text-sm text-gray-700 font-medium">{PAYMENT_LABELS[s.method] ?? s.method}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{s.count} tx</span>
                    <span className="text-sm font-black text-gray-900">{fmt(s.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-10 text-sm">Sin ventas en el período</p>
        )}
      </div>
    </div>
  );
};
