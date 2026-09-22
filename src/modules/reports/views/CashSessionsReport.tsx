import React, { useEffect, useState, useCallback } from 'react';
import { fmtCRDateTime, parseServerDate } from '@/utils/crDate';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Lock, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, RefreshCw, Timer, Download, Printer,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { KPICard } from '../components/KPICard';
import { downloadCsv } from '@/utils/csv';

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
  cashier_name: string;
  sales_total: number;
  cash_sales: number;
  card_sales: number;
  sinpe_sales: number;
  invoice_count: number;
  /** Movimientos manuales del fondo de caja (vales, compras, retiros). */
  cash_in: number;
  cash_out: number;
  /** Ventas anuladas del turno: no suman, pero tienen que poder verse. */
  voids_count: number;
  voids_total: number;
  /** Abonos de apartados cobrados en esa caja. */
  reservations_total: number;
  reservations_cash: number;
  expected_closing: number;
  discrepancy: number | null;
  duration_min: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDt = (s: string) =>
  fmtCRDateTime(s);

function durationLabel(min: number | null) {
  if (min === null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { tenantId: string | null; from: string; to: string }

export const CashSessionsReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const { tenantId: tenantActual } = useTenantId();
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
  const totalIn    = sessions.reduce((s, r) => s + (r.cash_in ?? 0), 0);
  const totalOut   = sessions.reduce((s, r) => s + (r.cash_out ?? 0), 0);
  const totalVoids = sessions.reduce((s, r) => s + (r.voids_total ?? 0), 0);
  const voidsCount = sessions.reduce((s, r) => s + (r.voids_count ?? 0), 0);
  const totalAbonos = sessions.reduce((s, r) => s + (r.reservations_total ?? 0), 0);

  /**
   * Imprime el reporte de cierres por la impresora configurada.
   *
   * El CSV sirve para la computadora, pero el cierre se revisa en el mostrador y
   * se archiva en papel: hasta ahora había que abrirlo en Excel para verlo. Sale
   * por la misma impresora que los tiquetes (térmica, Bluetooth, QZ o navegador).
   */
  const [printing, setPrinting] = useState(false);
  const imprimir = useCallback(async () => {
    setPrinting(true);
    try {
      const L: Array<{ t: 'title' | 'center' | 'row' | 'text' | 'sep'; a?: string; b?: string }> = [];
      L.push({ t: 'title', a: 'CIERRES DE CAJA' });
      L.push({ t: 'center', a: `${fmtDt(from)} al ${fmtDt(to)}` });
      L.push({ t: 'center', a: `Impreso ${new Date().toLocaleString('es-CR')}` });
      L.push({ t: 'sep' });

      for (const s2 of sessions) {
        L.push({ t: 'text', a: s2.cashier_name || 'Sin vendedor' });
        L.push({ t: 'row', a: 'Abrió:', b: fmtDt(s2.opening_date) });
        L.push({ t: 'row', a: 'Cerró:', b: s2.closing_date ? fmtDt(s2.closing_date) : 'ABIERTA' });
        L.push({ t: 'row', a: 'Fondo:', b: fmt(s2.opening_amount) });
        L.push({ t: 'row', a: 'Efectivo:', b: fmt(s2.cash_sales) });
        L.push({ t: 'row', a: 'Tarjeta:', b: fmt(s2.card_sales) });
        L.push({ t: 'row', a: 'SINPE:', b: fmt(s2.sinpe_sales) });
        if ((s2.reservations_total ?? 0) > 0) L.push({ t: 'row', a: 'Abonos apartados:', b: fmt(s2.reservations_total) });
        if ((s2.cash_in ?? 0) > 0) L.push({ t: 'row', a: '+ Entradas:', b: fmt(s2.cash_in) });
        if ((s2.cash_out ?? 0) > 0) L.push({ t: 'row', a: '- Salidas:', b: fmt(s2.cash_out) });
        if ((s2.voids_count ?? 0) > 0) L.push({ t: 'row', a: 'Anuladas:', b: `${s2.voids_count} · ${fmt(s2.voids_total)}` });
        L.push({ t: 'row', a: 'Esperado:', b: fmt(s2.expected_closing) });
        L.push({ t: 'row', a: 'Contado:', b: s2.closing_amount != null ? fmt(s2.closing_amount) : '—' });
        if (s2.discrepancy !== null) {
          const d = s2.discrepancy ?? 0;
          L.push({ t: 'row', a: d === 0 ? 'CUADRADO' : d > 0 ? 'SOBRANTE:' : 'FALTANTE:', b: fmt(Math.abs(d)) });
        }
        L.push({ t: 'sep' });
      }

      L.push({ t: 'center', a: 'TOTALES DEL PERIODO' });
      L.push({ t: 'row', a: 'Sesiones:', b: `${closed.length} cerradas · ${open.length} abiertas` });
      L.push({ t: 'row', a: 'Ventas:', b: fmt(totalSales) });
      L.push({ t: 'row', a: 'Efectivo:', b: fmt(totalCash) });
      L.push({ t: 'row', a: 'Tarjeta:', b: fmt(totalCard) });
      L.push({ t: 'row', a: 'SINPE:', b: fmt(totalSinpe) });
      if (totalIn > 0) L.push({ t: 'row', a: '+ Entradas:', b: fmt(totalIn) });
      if (totalOut > 0) L.push({ t: 'row', a: '- Salidas:', b: fmt(totalOut) });
      if (voidsCount > 0) L.push({ t: 'row', a: 'Anulaciones:', b: `${voidsCount} · ${fmt(totalVoids)}` });
      if (totalAbonos > 0) L.push({ t: 'row', a: 'Abonos apartados:', b: fmt(totalAbonos) });
      L.push({ t: 'row', a: 'Diferencias:', b: fmt(totalDisc) });
      L.push({ t: 'center', a: `${withDisc.length} sesión(es) con diferencia` });

      await posPrinterService.printDoc(L, tenantActual ?? tenantId ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo imprimir');
    } finally { setPrinting(false); }
  }, [sessions, from, to, closed.length, open.length, totalSales, totalCash, totalCard,
    totalSinpe, totalIn, totalOut, voidsCount, totalVoids, totalAbonos, totalDisc, withDisc.length, tenantActual, tenantId]);

  const downloadCSV = useCallback(() => {
    const rows: (string | number | null | undefined)[][] = [];

    // ── Resumen ────────────────────────────────────────────────────────────────
    rows.push(['RESUMEN', `${from} al ${to}`]);
    rows.push(['Sesiones cerradas',   closed.length]);
    rows.push(['Sesiones abiertas',   open.length]);
    rows.push(['Total ventas',        totalSales]);
    rows.push(['Ventas efectivo',     totalCash]);
    rows.push(['Ventas SINPE',        totalSinpe]);
    rows.push(['Ventas tarjeta',      totalCard]);
    rows.push(['Entradas de efectivo', totalIn]);
    rows.push(['Salidas de efectivo',  totalOut]);
    rows.push(['Anulaciones',          `${voidsCount} · ${totalVoids}`]);
    rows.push(['Abonos de apartados',  totalAbonos]);
    rows.push(['Diferencias totales', totalDisc]);
    rows.push(['Sesiones con diferencia', withDisc.length]);
    rows.push([]);

    // ── Detalle por sesión ─────────────────────────────────────────────────────
    rows.push(['DETALLE POR SESIÓN']);
    rows.push([
      'Vendedor', 'Apertura', 'Cierre', 'Estado',
      'Monto apertura (₡)', 'Total ventas (₡)',
      'Efectivo (₡)', 'SINPE (₡)', 'Tarjeta (₡)',
      'N° facturas', 'Entradas (₡)', 'Salidas (₡)',
      'Anuladas', 'Monto anulado (₡)', 'Abonos apartados (₡)', 'Monto cierre (₡)',
      'Efectivo esperado (₡)', 'Diferencia (₡)', 'Duración (min)',
    ]);
    for (const s of sessions) {
      rows.push([
        s.cashier_name ?? '',
        s.opening_date,
        s.closing_date ?? '',
        s.status === 'open' ? 'Abierta' : 'Cerrada',
        s.opening_amount,
        s.sales_total,
        s.cash_sales,
        s.sinpe_sales,
        s.card_sales,
        s.invoice_count,
        s.cash_in ?? 0,
        s.cash_out ?? 0,
        s.voids_count ?? 0,
        s.voids_total ?? 0,
        s.reservations_total ?? 0,
        s.closing_amount ?? '',
        s.expected_closing,
        s.discrepancy ?? '',
        s.duration_min ?? '',
      ]);
    }

    downloadCsv(`cierres-caja-${from}-a-${to}`, rows);
  }, [sessions, closed, open, totalSales, totalCash, totalSinpe, totalCard, totalDisc, withDisc, from, to]);

  // Chart data: all three payment methods per session (last 20)
  const chartData = [...sessions].reverse().slice(-20).map(s => ({
    label:    (parseServerDate(s.opening_date) ?? new Date())
      .toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', month: 'short', day: 'numeric' }),
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

      {/* Descargar / imprimir */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => void imprimir()}
          disabled={sessions.length === 0 || printing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-violet-400 hover:text-violet-700 text-gray-600 text-sm font-semibold rounded-xl transition disabled:opacity-40 shadow-sm"
        >
          {printing ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
          {printing ? 'Imprimiendo…' : 'Imprimir'}
        </button>
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

      {/* Movimientos del fondo, anulaciones y abonos: parte del cierre que antes
          no salía en el reporte, y sin la cual la diferencia no se explica. */}
      {(totalIn > 0 || totalOut > 0 || voidsCount > 0 || totalAbonos > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Entradas de efectivo</p>
            <p className="text-xl font-black text-emerald-800">{fmt(totalIn)}</p>
            <p className="text-xs text-emerald-600">suman al esperado</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Salidas de efectivo</p>
            <p className="text-xl font-black text-red-800">{fmt(totalOut)}</p>
            <p className="text-xs text-red-600">restan del esperado</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Anulaciones</p>
            <p className="text-xl font-black text-amber-800">{fmt(totalVoids)}</p>
            <p className="text-xs text-amber-600">{voidsCount} factura{voidsCount === 1 ? '' : 's'} · no suman</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Abonos de apartados</p>
            <p className="text-xl font-black text-violet-800">{fmt(totalAbonos)}</p>
            <p className="text-xs text-violet-600">plata sin factura todavía</p>
          </div>
        </div>
      )}

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
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Vendedor</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Apertura</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cierre</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Apertura</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Total ventas</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase">Efectivo</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-violet-600 uppercase">SINPE</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-blue-600 uppercase">Tarjeta</th>
                  {/* Entradas, salidas y anulaciones: forman parte del cierre y
                      antes no aparecían en ningún lado del reporte. */}
                  <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase">Entradas</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-red-600 uppercase">Salidas</th>
                  <th className="text-right px-3 py-3 text-xs font-bold text-amber-600 uppercase">Anuladas</th>
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
                      <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap text-xs">{s.cashier_name ?? '—'}</td>
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
                      <td className="px-3 py-3 text-right text-emerald-700 font-semibold text-xs">
                        {s.cash_in > 0 ? fmt(s.cash_in) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-red-700 font-semibold text-xs">
                        {s.cash_out > 0 ? fmt(s.cash_out) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        {s.voids_count > 0
                          ? <span className="font-bold text-amber-700" title={`${s.voids_count} factura(s) anulada(s)`}>
                              {s.voids_count} · {fmt(s.voids_total)}
                            </span>
                          : <span className="text-gray-300">—</span>}
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
