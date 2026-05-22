import React, { useEffect, useState, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Target, ShoppingCart,
  RefreshCw, ArrowUp, ArrowDown, Download, Tag, Calendar,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { KPICard } from '../components/KPICard';
import { WaterfallRow } from '../components/WaterfallRow';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayRow {
  date: string;
  revenue: number;
  cogs: number;
  expenses: number;
  gross: number;
  net: number;
  activePromos: string[];   // names of promotions active this day
}

interface PeriodPromo {
  id:         string;
  name:       string;
  type:       string;
  value:      number;
  applies_to: string;
  starts_at:  string;
  ends_at:    string;
  activeDays: number;       // days active within the report range
  category?:  { name: string; icon: string } | null;
}

interface Summary {
  revenue: number;
  invoiceCount: number;
  cogs: number;
  expenses: number;
  gross: number;
  net: number;
  margin: number;
  byDay: DayRow[];
  periodPromos: PeriodPromo[];
  revenueByMethod: Array<{ method: string; label: string; total: number; color: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `₡${(n / 1_000).toFixed(0)}k`;
  return `₡${n.toFixed(0)}`;
};

const METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  cash:     { label: 'Efectivo',       color: '#10b981' },
  card:     { label: 'Tarjeta',        color: '#3b82f6' },
  sinpe:    { label: 'SINPE',          color: '#8b5cf6' },
  transfer: { label: 'Transferencia',  color: '#f59e0b' },
  check:    { label: 'Cheque',         color: '#6b7280' },
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props { tenantId: string | null; from: string; to: string }

export const ProfitReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const summary = await apiFetch<Summary>(`/reports/profit?from=${from}&to=${to}`);
      setSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar reporte');
    } finally {
      setLoading(false);
    }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const downloadCSV = useCallback(() => {
    if (!summary) return;
    const { revenue, invoiceCount, cogs, expenses, gross, net, margin, byDay, revenueByMethod, periodPromos } = summary;

    const BOM  = '﻿';
    const sep  = ',';
    const nl   = '\r\n';

    const row = (...cells: (string | number)[]) =>
      cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(sep);

    const sections: string[] = [];

    // ── Resumen general ──────────────────────────────────────────────────────
    sections.push(row('RESUMEN', `${from} al ${to}`));
    sections.push(row('Métrica', 'Monto (₡)', '% sobre ingresos'));
    sections.push(row('Ingresos totales',      revenue,    '100.00'));
    sections.push(row('Costo de compras',       cogs,       revenue > 0 ? ((cogs / revenue) * 100).toFixed(2) : '0'));
    sections.push(row('Ganancia bruta',         gross,      revenue > 0 ? ((gross / revenue) * 100).toFixed(2) : '0'));
    sections.push(row('Gastos operativos',      expenses,   revenue > 0 ? ((expenses / revenue) * 100).toFixed(2) : '0'));
    sections.push(row('Ganancia neta',          net,        revenue > 0 ? margin.toFixed(2) : '0'));
    sections.push(row('Total facturas',         invoiceCount, ''));
    sections.push('');

    // ── Por método de pago ────────────────────────────────────────────────────
    sections.push(row('INGRESOS POR MÉTODO DE PAGO'));
    sections.push(row('Método', 'Monto (₡)', '% del total'));
    for (const m of revenueByMethod) {
      sections.push(row(m.label, m.total, revenue > 0 ? ((m.total / revenue) * 100).toFixed(2) : '0'));
    }
    sections.push('');

    // ── Detalle diario ────────────────────────────────────────────────────────
    sections.push(row('DETALLE DIARIO'));
    sections.push(row('Fecha', 'Ingresos (₡)', 'Costo Compras (₡)', 'Gastos (₡)', 'Ganancia Bruta (₡)', 'Ganancia Neta (₡)', 'Margen %'));
    for (const d of byDay) {
      sections.push(row(
        d.date,
        d.revenue,
        d.cogs,
        d.expenses,
        d.gross,
        d.net,
        d.revenue > 0 ? ((d.net / d.revenue) * 100).toFixed(2) : '0',
      ));
    }
    sections.push(row('TOTAL', revenue, cogs, expenses, gross, net, revenue > 0 ? margin.toFixed(2) : '0'));

    // ── Promociones del período ────────────────────────────────────────────────
    if (periodPromos.length > 0) {
      sections.push('');
      sections.push(row('PROMOCIONES EN EL PERÍODO'));
      sections.push(row('Nombre', 'Tipo', 'Descuento', 'Aplica a', 'Desde', 'Hasta', 'Días activos en período'));
      for (const p of periodPromos) {
        const typeLabel = p.type === 'percentage' ? 'Porcentaje' : p.type === 'fixed' ? 'Monto fijo' : '2x1';
        const val       = p.type === 'percentage' ? `${p.value}%` : p.type === 'fixed' ? `₡${p.value}` : '2x1';
        const scope     = p.applies_to === 'all' ? 'Todos' : p.applies_to === 'category' ? `Categoría: ${p.category?.name ?? ''}` : 'Productos específicos';
        sections.push(row(p.name, typeLabel, val, scope, p.starts_at, p.ends_at, p.activeDays));
      }
    }

    const csv  = BOM + sections.join(nl);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ganancias-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [summary, from, to]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <RefreshCw size={18} className="animate-spin" /> Calculando ganancias...
      </div>
    );
  }

  if (!summary) return null;

  const revenue = (summary as any).total_revenue ?? 0;
  const expenses = (summary as any).total_expenses ?? 0;
  const net = (summary as any).profit ?? 0;
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;
  const byDay = (summary as any).byDay ?? [];
  const revenueByMethod = (summary as any).revenueByMethod ?? [];
  const periodPromos = (summary as any).periodPromos ?? [];
  const invoiceCount = 0;
  const cogs = 0;
  const gross = net;

  // Days that had at least one promo active
  const promoDays = new Set(byDay.filter((d: any) => d.activePromos.length > 0).map((d: any) => d.date));

  const promoTypeLabel: Record<string, string> = {
    percentage: 'Porcentaje', fixed: 'Monto fijo', '2x1': '2×1',
  };
  const promoTypeColor: Record<string, string> = {
    percentage: 'bg-violet-100 text-violet-700',
    fixed:      'bg-blue-100 text-blue-700',
    '2x1':      'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Download button */}
      <div className="flex justify-end">
        <button
          onClick={downloadCSV}
          disabled={!summary}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-emerald-400 hover:text-emerald-700 text-gray-600 text-sm font-semibold rounded-xl transition disabled:opacity-40 shadow-sm"
        >
          <Download size={15} />
          Descargar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          icon={TrendingUp}
          label="Ingresos"
          value={fmt(revenue)}
          sub={`${invoiceCount} factura${invoiceCount !== 1 ? 's' : ''}`}
          color="bg-blue-500"
        />
        <KPICard
          icon={ShoppingCart}
          label="Costo compras"
          value={fmt(cogs)}
          sub="compras recibidas"
          color="bg-orange-500"
        />
        <KPICard
          icon={TrendingDown}
          label="Gastos operativos"
          value={fmt(expenses)}
          sub="gastos del período"
          color="bg-red-500"
        />
        <KPICard
          icon={DollarSign}
          label="Ganancia bruta"
          value={fmt(gross)}
          sub={revenue > 0 ? `${((gross / revenue) * 100).toFixed(1)}% del ingreso` : ''}
          color={gross >= 0 ? 'bg-emerald-400' : 'bg-red-500'}
        />
        <KPICard
          icon={Target}
          label="Ganancia neta"
          value={fmt(net)}
          sub={`Margen: ${margin.toFixed(1)}%`}
          color={net >= 0 ? 'bg-emerald-600' : 'bg-red-600'}
          highlight={net >= 0}
        />
      </div>

      {/* Main chart */}
      {byDay.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-700 mb-4">Ingresos, costos y ganancia neta por día</p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={byDay} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { month: 'short', day: 'numeric' })}
              />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: any) => fmt(Number(v))}
                labelFormatter={(d: any) => new Date(String(d) + 'T12:00:00').toLocaleDateString('es-CR', { dateStyle: 'medium' })}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue"  name="Ingresos"       fill="#3b82f6"  radius={[3,3,0,0]} />
              <Bar dataKey="cogs"     name="Costo compras"  fill="#f97316"  radius={[3,3,0,0]} />
              <Bar dataKey="expenses" name="Gastos"         fill="#ef4444"  radius={[3,3,0,0]} />
              <Line dataKey="net"     name="Ganancia neta"  stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Profit waterfall + payment breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Waterfall breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-700 mb-4">Desglose de rentabilidad</p>
          <div className="divide-y divide-gray-50">
            <WaterfallRow
              label="Ingresos totales"
              value={revenue}
              pct={100}
              color="bg-blue-500"
              bold
            />
            <WaterfallRow
              label="− Costo de compras"
              value={-cogs}
              pct={revenue > 0 ? (cogs / revenue) * 100 : 0}
              color="bg-orange-400"
            />
            <WaterfallRow
              label="= Ganancia bruta"
              value={gross}
              pct={revenue > 0 ? (gross / revenue) * 100 : 0}
              color={gross >= 0 ? 'bg-emerald-400' : 'bg-red-400'}
              bold
            />
            <WaterfallRow
              label="− Gastos operativos"
              value={-expenses}
              pct={revenue > 0 ? (expenses / revenue) * 100 : 0}
              color="bg-red-400"
            />
            <WaterfallRow
              label="= Ganancia neta"
              value={net}
              pct={revenue > 0 ? (net / revenue) * 100 : 0}
              color={net >= 0 ? 'bg-emerald-600' : 'bg-red-600'}
              bold
            />
          </div>

          {/* Net margin indicator */}
          <div className={`mt-4 rounded-xl px-4 py-3 flex items-center gap-3 ${net >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            {net >= 0
              ? <ArrowUp size={18} className="text-emerald-600 shrink-0" />
              : <ArrowDown size={18} className="text-red-600 shrink-0" />}
            <div>
              <p className={`text-sm font-black ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {net >= 0 ? 'Negocio rentable' : 'Período con pérdida'}
              </p>
              <p className="text-xs text-gray-500">
                Margen neto del {margin.toFixed(2)}% sobre ingresos
              </p>
            </div>
          </div>
        </div>

        {/* Revenue by payment method */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-700 mb-4">Ingresos por método de pago</p>
          {revenueByMethod.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-300 text-sm">Sin datos</div>
          ) : (
            <div className="space-y-3">
              {revenueByMethod.map((m: any) => (
                <div key={m.method} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="flex-1 text-sm text-gray-700">{m.label}</span>
                  <div className="flex-1">
                    <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${revenue > 0 ? (m.total / revenue) * 100 : 0}%`,
                          backgroundColor: m.color,
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-28 text-right text-sm font-bold text-gray-800">{fmt(m.total)}</span>
                  <span className="w-12 text-right text-xs text-gray-400">
                    {revenue > 0 ? ((m.total / revenue) * 100).toFixed(1) : '0'}%
                  </span>
                </div>
              ))}

              <div className="pt-3 border-t border-gray-100 flex justify-between text-sm">
                <span className="font-semibold text-gray-600">Total ingresos</span>
                <span className="font-black text-gray-900">{fmt(revenue)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Daily detail table */}
      {/* ── Promotions during period ─────────────────────────────────────── */}
      {periodPromos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={16} className="text-violet-600" />
            <p className="font-bold text-gray-800">
              Promociones activas en el período
            </p>
            <span className="ml-auto text-xs bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full">
              {periodPromos.length} promoción{periodPromos.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Los ingresos ya reflejan los descuentos aplicados — el total guardado en cada factura es el precio con promoción.
          </p>
          <div className="space-y-2">
            {periodPromos.map((p: any) => {
              const discountLabel = p.type === 'percentage'
                ? `${p.value}% de descuento`
                : p.type === 'fixed'
                ? `₡${Number(p.value).toLocaleString('es-CR')} de descuento`
                : '2×1';
              const scopeLabel = p.applies_to === 'all'
                ? 'Todos los productos'
                : p.applies_to === 'category'
                ? `Categoría: ${p.category?.icon ?? ''} ${p.category?.name ?? '—'}`
                : 'Productos específicos';

              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-100">
                  <div className="shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-black ${promoTypeColor[p.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {promoTypeLabel[p.type] ?? p.type}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{discountLabel} · {scopeLabel}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-xs text-violet-600 font-semibold">
                      <Calendar size={11} />
                      {p.starts_at === p.ends_at
                        ? new Date(p.starts_at + 'T12:00:00').toLocaleDateString('es-CR', { dateStyle: 'short' })
                        : `${new Date(p.starts_at + 'T12:00:00').toLocaleDateString('es-CR', { dateStyle: 'short' })} — ${new Date(p.ends_at + 'T12:00:00').toLocaleDateString('es-CR', { dateStyle: 'short' })}`}
                    </div>
                    <p className="text-xs text-violet-500 mt-0.5">
                      {p.activeDays} día{p.activeDays !== 1 ? 's' : ''} en este período
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Days with promotions highlighted */}
          {promoDays.size > 0 && (
            <div className="mt-4 pt-4 border-t border-violet-100">
              <p className="text-xs font-bold text-violet-700 mb-2 flex items-center gap-1">
                <Tag size={11} /> Días con promoción activa ({promoDays.size})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(promoDays).sort().map((date: unknown) => (
                  <span key={String(date)} className="text-xs bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {byDay.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <p className="font-bold text-gray-800">Detalle diario</p>
            {promoDays.size > 0 && (
              <span className="flex items-center gap-1 text-xs text-violet-600 font-semibold bg-violet-50 px-2 py-0.5 rounded-full">
                <Tag size={10} /> días con promo marcados
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Ingresos</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Costo compras</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Gastos</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Ganancia bruta</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Ganancia neta</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byDay.map(d => {
                  const hasPromo = d.activePromos.length > 0;
                  return (
                    <tr key={d.date} className={`hover:bg-gray-50/50 transition ${d.net < 0 ? 'bg-red-50/20' : ''} ${hasPromo ? 'bg-violet-50/30' : ''}`}>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={hasPromo ? 'text-violet-700 font-semibold' : 'text-gray-600'}>
                            {new Date(d.date + 'T12:00:00').toLocaleDateString('es-CR', { dateStyle: 'medium' })}
                          </span>
                          {hasPromo && (
                            <span title={d.activePromos.join(', ')}
                              className="inline-flex items-center gap-0.5 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                              <Tag size={9} /> {d.activePromos.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(d.revenue)}</td>
                      <td className="px-4 py-3 text-right text-orange-600">{d.cogs > 0 ? fmt(d.cogs) : '—'}</td>
                      <td className="px-4 py-3 text-right text-red-600">{d.expenses > 0 ? fmt(d.expenses) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${d.gross >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fmt(d.gross)}
                      </td>
                      <td className={`px-4 py-3 text-right font-black ${d.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmt(d.net)}
                      </td>
                      <td className={`px-4 py-3 text-right text-xs font-semibold ${d.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {d.revenue > 0 ? ((d.net / d.revenue) * 100).toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Total período</td>
                  <td className="px-4 py-3 text-right font-black text-blue-700">{fmt(revenue)}</td>
                  <td className="px-4 py-3 text-right font-black text-orange-600">{fmt(cogs)}</td>
                  <td className="px-4 py-3 text-right font-black text-red-600">{fmt(expenses)}</td>
                  <td className={`px-4 py-3 text-right font-black ${gross >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(gross)}</td>
                  <td className={`px-4 py-3 text-right font-black ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(net)}</td>
                  <td className={`px-4 py-3 text-right font-black text-xs ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {revenue > 0 ? margin.toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Costo de compras = compras marcadas como recibidas en el período · Gastos = módulo de gastos · Ganancia bruta = Ingresos − Compras · Ganancia neta = Bruta − Gastos
        {periodPromos.length > 0 && ' · Los ingresos ya incluyen los descuentos de promociones'}
      </p>
    </div>
  );
};
