import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Users, TrendingUp, CreditCard, Receipt, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

interface SellerStat {
  userId: string;
  name: string;
  email: string;
  totalRevenue: number;
  totalInvoices: number;
  avgTicket: number;
}

const BAR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

interface Props { tenantId: string | null; from: string; to: string }

export const SellerReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [sellers, setSellers] = useState<SellerStat[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Join: invoices → cash_sessions → users
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id, total,
          cash_sessions!inner(
            user_id,
            users!inner(id, full_name, email)
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('issued_at', `${from}T00:00:00`)
        .lte('issued_at', `${to}T23:59:59`);

      if (error) throw error;
      setRawCount((data ?? []).length);

      // Aggregate by user
      const map: Record<string, SellerStat> = {};
      (data ?? []).forEach((inv: any) => {
        const session = Array.isArray(inv.cash_sessions) ? inv.cash_sessions[0] : inv.cash_sessions;
        const user = session
          ? (Array.isArray(session.users) ? session.users[0] : session.users)
          : null;
        const uid = user?.id ?? 'unknown';
        const name = user?.full_name ?? user?.email ?? 'Sin asignar';
        const email = user?.email ?? '';
        if (!map[uid]) map[uid] = { userId: uid, name, email, totalRevenue: 0, totalInvoices: 0, avgTicket: 0 };
        map[uid].totalRevenue += Number(inv.total);
        map[uid].totalInvoices += 1;
      });
      const stats = Object.values(map).map(s => ({ ...s, avgTicket: s.totalRevenue / s.totalInvoices }));
      stats.sort((a, b) => b.totalRevenue - a.totalRevenue);
      setSellers(stats);
    } catch (e) {
      console.error('SellerReport error:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = sellers.reduce((s, x) => s + x.totalRevenue, 0);

  const barData = sellers.slice(0, 8).map(s => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name,
    total: s.totalRevenue,
  }));

  const exportCSV = () => {
    if (!sellers.length) return;
    const header = 'Vendedor,Email,Facturas,Total Ventas,Ticket Promedio';
    const rows = sellers.map(s =>
      `${s.name},${s.email},${s.totalInvoices},${s.totalRevenue.toFixed(0)},${s.avgTicket.toFixed(0)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendedores_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Vendedores', value: loading ? '—' : String(sellers.length), color: 'bg-violet-500' },
          { icon: TrendingUp, label: 'Ingresos totales', value: loading ? '—' : fmt(totalRevenue), color: 'bg-emerald-500' },
          { icon: Receipt, label: 'Facturas', value: loading ? '—' : String(rawCount), color: 'bg-blue-500' },
          { icon: CreditCard, label: 'Ticket promedio', value: loading || !rawCount ? '—' : fmt(totalRevenue / rawCount), color: 'bg-orange-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {barData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-900 mb-4">Ventas por vendedor</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Ventas']} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} cursor={{ fill: '#f5f3ff' }} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={52}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sellers table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-gray-900">Detalle por vendedor</h2>
            <p className="text-xs text-gray-400 mt-0.5">{sellers.length} vendedor{sellers.length !== 1 ? 'es' : ''}</p>
          </div>
          <button onClick={exportCSV} disabled={!sellers.length} className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition">
            <Download size={15} />Exportar CSV
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-violet-500" />
          </div>
        ) : sellers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-left w-8">#</th>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-left">Vendedor</th>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Facturas</th>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Ticket Prom.</th>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Total Ventas</th>
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-right w-32">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sellers.map((s, i) => {
                  const pct = totalRevenue > 0 ? (s.totalRevenue / totalRevenue) * 100 : 0;
                  return (
                    <tr key={s.userId} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-4">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-gray-700">{s.totalInvoices}</td>
                      <td className="px-5 py-4 text-right text-gray-700">{fmt(s.avgTicket)}</td>
                      <td className="px-5 py-4 text-right font-black text-gray-900">{fmt(s.totalRevenue)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                          </div>
                          <span className="text-xs font-bold text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center">
            <Users size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Sin datos de ventas por vendedor en el período</p>
          </div>
        )}
      </div>
    </div>
  );
};
