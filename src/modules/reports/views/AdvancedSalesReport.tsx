import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ShoppingBag, CreditCard, Receipt, Download, Package, Eye, X } from 'lucide-react';
import { useReportsData } from '@/hooks/reports/useReportsData';
import { invoicesService, type InvoiceItem } from '@/services/invoice/invoiceService';
import { formatWallClock } from '@/utils/datetime';

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

interface Props {
  tenantId: string | null;
  from: string;
  to: string;
}

export const AdvancedSalesReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const {
    summary, topProducts, invoices, loading,
    fetchSummary, fetchTopProducts, fetchInvoices, exportCSV,
  } = useReportsData(tenantId);

  useEffect(() => {
    fetchSummary(from, to);
    fetchTopProducts(from, to);
    fetchInvoices(from, to);
  }, [tenantId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detalle de una factura (modal con sus líneas).
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const openDetail = async (inv: any) => {
    setDetail({ ...inv, items: null });
    setDetailLoading(true);
    setDetailError('');
    try {
      const full = await invoicesService.getInvoiceById(inv.id);
      setDetail(full);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'No se pudo cargar el detalle');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'Ventas hoy', value: loading ? '—' : fmt(summary?.todayTotal ?? 0), sub: `${summary?.todayCount ?? 0} facturas`, color: 'bg-emerald-500' },
          { icon: ShoppingBag, label: 'Total período', value: loading ? '—' : fmt(summary?.periodTotal ?? 0), sub: `${summary?.periodCount ?? 0} facturas`, color: 'bg-blue-500' },
          { icon: CreditCard, label: 'Ticket promedio', value: loading ? '—' : fmt(summary?.avgTicket ?? 0), color: 'bg-violet-500' },
          { icon: Receipt, label: 'Días analizados', value: loading ? '—' : String(summary?.dailyStats.length ?? 0), color: 'bg-orange-400' },
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

      {/* Daily chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-base font-black text-gray-900 mb-4">Ventas por día</h2>
        {loading ? (
          <div className="h-52 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          </div>
        ) : summary?.dailyStats.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={summary.dailyStats} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Total']} labelFormatter={(_l, p) => p?.[0]?.payload?.date ?? ''} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} cursor={{ fill: '#f0fdf4' }} />
              <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-12 text-sm">Sin ventas en el período</p>
        )}
      </div>

      {/* Payment + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment breakdown */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-900 mb-4">Métodos de pago</h2>
          {summary?.paymentStats.length ? (
            <div className="flex flex-col items-center gap-4">
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
              <div className="space-y-2 w-full">
                {summary.paymentStats.map((s, idx) => {
                  const pct = summary.periodTotal > 0 ? (s.total / summary.periodTotal) * 100 : 0;
                  return (
                    <div key={`payment-detail-${idx}`}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 font-medium text-gray-700">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PAYMENT_COLORS[s.method] ?? '#94a3b8', display: 'inline-block' }} />
                          {PAYMENT_LABELS[s.method] ?? s.method}
                        </span>
                        <span className="font-black text-gray-900">{fmt(s.total)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PAYMENT_COLORS[s.method] ?? '#94a3b8' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-10 text-sm">Sin datos</p>
          )}
        </div>

        {/* Top products */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-900 mb-4 flex items-center gap-2">
            <Package size={16} className="text-emerald-500" />Top productos vendidos
          </h2>
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
            </div>
          ) : topProducts.length ? (
            <div className="space-y-2 overflow-y-auto max-h-64">
              {topProducts.map((p, i) => (
                <div key={p.product_id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.qty} unidades</p>
                  </div>
                  <span className="text-sm font-black text-emerald-600 shrink-0">{fmt(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-10 text-sm">Sin datos</p>
          )}
        </div>
      </div>

      {/* Invoices table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-gray-900">Facturas del período</h2>
            <p className="text-xs text-gray-400 mt-0.5">{invoices.length} registros</p>
          </div>
          <button
            onClick={exportCSV}
            disabled={!invoices.length}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition"
          >
            <Download size={15} />Exportar CSV
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
          </div>
        ) : invoices.length ? (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  {['Factura', 'Fecha', 'Cliente', 'Método', 'Total', 'Detalle'].map(h => (
                    <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide ${h === 'Total' ? 'text-right' : h === 'Detalle' ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 font-mono text-xs font-bold text-gray-700">{inv.invoice_number}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{formatWallClock(inv.issued_at, { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[140px] truncate">{inv.customer_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      {(inv as any).payments && (inv as any).payments.length > 1 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700"
                          title={(inv as any).payments.map((p: any) => `${PAYMENT_LABELS[p.method] ?? p.method}: ₡${Number(p.amount).toLocaleString('es-CR')}`).join(' · ')}>
                          MIXTO ({(inv as any).payments.map((p: any) => (PAYMENT_LABELS[p.method] ?? p.method)[0]).join('+')})
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: (PAYMENT_COLORS[inv.payment_method] ?? '#94a3b8') + '22', color: PAYMENT_COLORS[inv.payment_method] ?? '#6b7280' }}>
                          {PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-gray-900">{fmt(Number(inv.total))}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => openDetail(inv)}
                        title="Ver contenido de la factura"
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-600 hover:text-white transition"
                      >
                        <Eye size={13} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-12 text-sm">Sin facturas en el período</p>
        )}
      </div>

      {/* Modal: detalle de la factura */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-black text-gray-900 text-sm">Factura {detail.invoice_number}</h3>
                <p className="text-xs text-gray-400">
                  {formatWallClock(detail.issued_at, { dateStyle: 'medium', timeStyle: 'short' })}
                  {detail.customer_name ? ` · ${detail.customer_name}` : ''}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="p-4 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
                </div>
              ) : detailError ? (
                <p className="text-red-600 text-sm text-center py-6">{detailError}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase">Cant.</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">P. Unit</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {((detail.items ?? []) as InvoiceItem[]).map((it, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-800">{it.product_name}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{Number(it.quantity)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmt(Number(it.unit_price))}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-800">{fmt(Number(it.subtotal))}</td>
                      </tr>
                    ))}
                    {(!detail.items || detail.items.length === 0) && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">Sin líneas</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 shrink-0 space-y-1">
              {Number(detail.tax_amount) > 0 && (
                <>
                  <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(Number(detail.subtotal))}</span></div>
                  <div className="flex justify-between text-sm text-gray-500"><span>Impuesto</span><span>{fmt(Number(detail.tax_amount))}</span></div>
                </>
              )}
              <div className="flex justify-between text-base font-black text-gray-900"><span>Total</span><span>{fmt(Number(detail.total))}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
