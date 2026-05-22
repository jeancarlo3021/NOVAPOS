import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Lock, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, RefreshCw, Timer, Download,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { KPICard } from '../components/KPICard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  opening_date: string;
  closing_date: string | null;
  opening_amount: number;
  closing_amount: number | null;
  status: 'open' | 'closed';
  notes: string | null;
  // enriched
  sales_total: number;
  cash_sales: number;
  card_sales: number;
  sinpe_sales: number;
  invoice_count: number;
  expected_closing: number;
  discrepancy: number | null;
  duration_min: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDt = (s: string) =>
  new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });

function durationLabel(min: number | null) {
  if (min === null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { tenantId: string | null; from: string; to: string }

export const CashSessionsReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const enriched = await apiFetch<SessionRow[]>(
        `/reports/cash-sessions?from=${from}&to=${to}`
      );
      setSessions(enriched ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar sesiones');
    } finally {
      setLoading(false);
    }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  // ── KPI aggregates ───────────────────────────────────────────────────────────

  const closed      = sessions.filter(s => s.status === 'closed');
  const open        = sessions.filter(s => s.status === 'open');
  const totalSales  = sessions.reduce((s, r) => s + r.sales_total,  0);
  const totalCash   = sessions.reduce((s, r) => s + r.cash_sales,   0);
  const totalSinpe  = sessions.reduce((s, r) => s + r.sinpe_sales,  0);
  const totalCard   = sessions.reduce((s, r) => s + r.card_sales,   0);
  const avgDuration = closed.length > 0
    ? Math.round(
        closed.filter(s => s.duration_min !== null).reduce((s, r) => s + (r.duration_min ?? 0), 0)
        / closed.filter(s => s.duration_min !== null).length
      )
    : null;
  const withDisc  = closed.filter(s => s.discrepancy !== null && Math.abs(s.discrepancy!) > 10);
  const totalDisc = closed.reduce((s, r) => s + (r.discrepancy ?? 0), 0);

  const downloadCSV = useCallback(() => {
    const BOM = '﻿';
    const sep = ',';
    const nl  = '\r\n';
    const row = (...cells: (string | number)[]) =>
      cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(sep);

    const lines: string[] = [];

    // ── Resumen ────────────────────────────────────────────────────────────────
    lines.push(row('RESUMEN', `${from} al ${to}`));
    lines.push(row('Sesiones cerradas',   closed.length));
    lines.push(row('Sesiones abiertas',   open.length));
    lines.push(row('Total ventas',        totalSales));
    lines.push(row('Ventas efectivo',     totalCash));
    lines.push(row('Ventas SINPE',        totalSinpe));
    lines.push(row('Ventas tarjeta',      totalCard));
    lines.push(row('Diferencias totales', totalDisc));
    lines.push(row('Sesiones con diferencia', withDisc.length));
    lines.push('');

    // ── Detalle por sesión ─────────────────────────────────────────────────────
    lines.push(row('DETALLE POR SESIÓN'));
    lines.push(row(
      'Apertura', 'Cierre', 'Estado',
      'Monto apertura (₡)', 'Total ventas (₡)',
      'Efectivo (₡)', 'SINPE (₡)', 'Tarjeta (₡)',
      'N° facturas', 'Monto cierre (₡)',
      'Efectivo esperado (₡)', 'Diferencia (₡)', 'Duración (min)',
    ));
    for (const s of sessions) {
      lines.push(row(
        s.opening_date,
        s.closing_date ?? '',
        s.status === 'open' ? 'Abierta' : 'Cerrada',
        s.opening_amount,
        s.sales_total,
        s.cash_sales,
        s.sinpe_sales,
        s.card_sales,
        s.invoice_count,
        s.closing_amount ?? '',
        s.expected_closing,
        s.discrepancy ?? '',
        s.duration_min ?? '',
      ));
    }

    const csv  = BOM + lines.join(nl);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cierres-caja-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessions, closed, open, totalSales, totalCash, totalSinpe, totalCard, totalDisc, withDisc, from, to]);

  // Chart data: all three payment methods per session (last 20)
  const chartData = [...sessions].reverse().slice(-20).map(s => ({
    label:    new Date(s.opening_date).toLocaleDateString('es-CR', { month: 'short', day: 'numeric' }),
    efectivo: s.cash_sales,
    sinpe:    s.sinpe_sales,
    tarjeta:  s.card_sales,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <RefreshCw size={18} className="animate-spin" /> Cargando sesiones de caja...
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Download */}
      <div className="flex justify-end">
        <button
          onClick={downloadCSV}
          disabled={sessions.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-blue-400 hover:text-blue-700 text-gray-600 text-sm font-semibold rounded-xl transition disabled:opacity-40 shadow-sm"
        >
          <Download size={15} />
          Descargar CSV
        </button>
      </div>

      {/* KPIs — row 1: sesiones */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={Lock}          label="Sesiones cerradas"  value={String(closed.length)}      sub={open.length > 0 ? `${open.length} abierta${open.length !== 1 ? 's' : ''}` : undefined} color="bg-blue-500" />
        <KPICard icon={TrendingUp}    label="Ventas del período" value={fmt(totalSales)}             sub={`${sessions.reduce((s,r) => s + r.invoice_count, 0)} facturas`} color="bg-gray-600" />
        <KPICard icon={Timer}         label="Duración promedio"  value={durationLabel(avgDuration)}  sub="por sesión"  color="bg-violet-500" />
        <KPICard icon={AlertTriangle} label="Diferencias"        value={fmt(Math.abs(totalDisc))}   sub={`${withDisc.length} sesión${withDisc.length !== 1 ? 'es' : ''} con diferencia`} color={withDisc.length > 0 ? 'bg-red-500' : 'bg-gray-400'} />
      </div>

      {/* KPIs — row 2: payment method totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-lg">₡</div>
          <div>
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Efectivo</p>
            <p className="text-xl font-black text-emerald-800">{fmt(totalCash)}</p>
            <p className="text-xs text-emerald-600">{totalSales > 0 ? ((totalCash / totalSales) * 100).toFixed(1) : '0'}% del total</p>
          </div>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm">SIN</div>
          <div>
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">SINPE</p>
            <p className="text-xl font-black text-violet-800">{fmt(totalSinpe)}</p>
            <p className="text-xs text-violet-600">{totalSales > 0 ? ((totalSinpe / totalSales) * 100).toFixed(1) : '0'}% del total</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm">💳</div>
          <div>
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Tarjeta</p>
            <p className="text-xl font-black text-blue-800">{fmt(totalCard)}</p>
            <p className="text-xs text-blue-600">{totalSales > 0 ? ((totalCard / totalSales) * 100).toFixed(1) : '0'}% del total</p>
          </div>
        </div>
      </div>

      {/* Chart — efectivo, SINPE, tarjeta por sesión */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-700 mb-4">Ventas por método de pago · por sesión de caja</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={14} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `₡${(Number(v)/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => fmt(Number(v))} />
              <Bar dataKey="efectivo" name="Efectivo" fill="#10b981" radius={[3,3,0,0]} stackId="a" />
              <Bar dataKey="sinpe"    name="SINPE"    fill="#8b5cf6" radius={[0,0,0,0]} stackId="a" />
              <Bar dataKey="tarjeta"  name="Tarjeta"  fill="#3b82f6" radius={[3,3,0,0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-2">
            {[['#10b981','Efectivo'],['#8b5cf6','SINPE'],['#3b82f6','Tarjeta']].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-500 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-gray-800">Detalle de sesiones</p>
          <span className="text-xs text-gray-400">{sessions.length} sesión{sessions.length !== 1 ? 'es' : ''}</span>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Clock size={32} className="text-gray-200" />
            <p className="text-gray-400 text-sm">No hay sesiones en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Apertura</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cierre</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Apertura</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Total ventas</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase">Efectivo</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-violet-600 uppercase">SINPE</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-blue-600 uppercase">Tarjeta</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cierre</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Diferencia</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Duración</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map(s => {
                  const hasDisc    = s.discrepancy !== null && Math.abs(s.discrepancy) > 10;
                  const discColor  = s.discrepancy === null ? '' : s.discrepancy < 0 ? 'text-red-600' : s.discrepancy > 0 ? 'text-amber-600' : 'text-emerald-600';
                  return (
                    <tr key={s.id} className={`hover:bg-gray-50/50 transition ${hasDisc ? 'bg-red-50/20' : ''}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDt(s.opening_date)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {s.closing_date ? fmtDt(s.closing_date) : <span className="text-emerald-600 font-semibold">Abierta</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600 text-xs">{fmt(s.opening_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {fmt(s.sales_total)}
                        <span className="block text-xs text-gray-400 font-normal">{s.invoice_count} fact.</span>
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-700 font-semibold text-xs">
                        {s.cash_sales > 0 ? fmt(s.cash_sales) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-violet-700 font-semibold text-xs">
                        {s.sinpe_sales > 0 ? fmt(s.sinpe_sales) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-blue-700 font-semibold text-xs">
                        {s.card_sales > 0 ? fmt(s.card_sales) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 text-xs">
                        {s.closing_amount !== null ? fmt(s.closing_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.discrepancy === null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={`font-bold ${discColor}`}>
                            {s.discrepancy > 0 ? '+' : ''}{fmt(s.discrepancy)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">{durationLabel(s.duration_min)}</td>
                      <td className="px-4 py-3 text-center">
                        {s.status === 'open' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                            <CheckCircle2 size={10} /> Abierta
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${
                            hasDisc ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            <Lock size={10} /> Cerrada
                            {hasDisc && <AlertTriangle size={10} />}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Discrepancy note */}
      <p className="text-xs text-gray-400 text-center">
        La diferencia = monto de cierre real − (monto apertura + ventas en efectivo). Valores positivos = sobran; negativos = faltan.
      </p>
    </div>
  );
};
