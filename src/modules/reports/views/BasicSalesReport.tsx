import React, { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ShoppingBag, CreditCard, Receipt, Download, FileText } from 'lucide-react';
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

  const { summary, loading, fetchSummary, invoices, fetchInvoices, exportCSV } = useReportsData(tenantId);

  useEffect(() => {
    fetchSummary(week.from, week.to);
    // El detalle de facturas: los totales dicen CUÁNTO se vendió, pero no
    // permiten buscar una venta concreta cuando el cliente pregunta por ella.
    fetchInvoices(week.from, week.to);
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

      {/* Ventas cobradas en dólares */}
      {!loading && summary?.usd && summary.usd.count > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div className="flex items-center gap-2 font-black text-emerald-800">
            <span className="text-lg">$</span> Cobrado en dólares
          </div>
          <div><span className="text-emerald-600 text-xs font-bold uppercase">Ventas</span><p className="font-black text-emerald-900">{summary.usd.count}</p></div>
          <div><span className="text-emerald-600 text-xs font-bold uppercase">Total (₡)</span><p className="font-black text-emerald-900">{fmt(summary.usd.totalCrc)}</p></div>
          <div><span className="text-emerald-600 text-xs font-bold uppercase">Equivalente ($)</span><p className="font-black text-emerald-900">${summary.usd.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
        </div>
      )}

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

      {/* Facturas del período */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between gap-3 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
            <FileText size={17} className="text-gray-400" />
            Facturas hechas
            <span className="text-xs font-bold text-gray-400">últimos 7 días</span>
          </h2>
          <button onClick={exportCSV} disabled={invoices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 disabled:opacity-40">
            <Download size={14} /> Excel
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="text-gray-400 text-center py-10 text-sm">
            {loading ? 'Cargando…' : 'Sin facturas en los últimos 7 días'}
          </p>
        ) : (
          /* Con scroll propio: un negocio con cientos de ventas no puede empujar
             el resto del reporte fuera de la pantalla. */
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-[11px] font-bold text-gray-500 uppercase">
                  <th className="text-left px-6 py-2">Factura</th>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Pago</th>
                  <th className="text-right px-6 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(f => (
                  <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-6 py-2 font-bold text-gray-800">#{f.invoice_number}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(f.issued_at).toLocaleString('es-CR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[14rem]">{f.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {PAYMENT_LABELS[f.payment_method] ?? f.payment_method}
                    </td>
                    <td className="px-6 py-2 text-right font-black text-gray-900">{fmt(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  {summary.paymentStats.map((e, idx) => (
                    <Cell key={`payment-${idx}`} fill={PAYMENT_COLORS[e.method] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 w-full">
              {summary.paymentStats.map((s, idx) => (
                <div key={`payment-detail-${idx}`} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
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
