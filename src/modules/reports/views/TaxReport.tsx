import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Percent, DollarSign, FileText, RefreshCw, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface InvoiceRow {
  kind: 'venta' | 'nc';
  invoice_number: string;
  customer_name: string;
  issued_at: string;
  month: string;        // YYYY-MM
  base: number;         // NC vienen en negativo
  iva: number;
  total: number;
  electronic: boolean;
}
interface TaxData { invoices: InvoiceRow[] }

interface MonthAgg {
  month: string;
  vCount: number; electronic: number; vSales: number; vBase: number; vIva: number;
  ncCount: number; ncBase: number; ncIva: number;
  netIva: number; netBase: number;
}
interface Agg {
  by_month: MonthAgg[];
  rows: InvoiceRow[];
  totals: { vCount: number; electronic: number; vSales: number; vBase: number; vIva: number; ncCount: number; ncBase: number; ncIva: number; netIva: number; netBase: number };
}

interface Props { tenantId: string | null; from: string; to: string }
type Filter = 'all' | 'fe' | 'corriente';

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return m ? `${names[Number(m) - 1] ?? m} ${y}` : ym;
};

function KPI({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

export const TaxReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [data, setData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setError('');
    try {
      const d = await apiFetch<TaxData>(`/reports/taxes?from=${from}&to=${to}`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar impuestos');
    } finally { setLoading(false); }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  // Agrega por mes según el filtro (Todas / solo FE / solo Corriente).
  const view = useMemo<Agg | null>(() => {
    if (!data) return null;
    const rows = data.invoices.filter(i => filter === 'all' || (filter === 'fe' ? i.electronic : !i.electronic));
    const months = new Map<string, MonthAgg>();
    const T = { vCount: 0, electronic: 0, vSales: 0, vBase: 0, vIva: 0, ncCount: 0, ncBase: 0, ncIva: 0, netIva: 0, netBase: 0 };
    for (const r of rows) {
      const m = months.get(r.month) ?? { month: r.month, vCount: 0, electronic: 0, vSales: 0, vBase: 0, vIva: 0, ncCount: 0, ncBase: 0, ncIva: 0, netIva: 0, netBase: 0 };
      if (r.kind === 'venta') {
        m.vCount++; m.vSales += r.total; m.vBase += r.base; m.vIva += r.iva; if (r.electronic) m.electronic++;
        T.vCount++; T.vSales += r.total; T.vBase += r.base; T.vIva += r.iva; if (r.electronic) T.electronic++;
      } else { // nc (negativos)
        m.ncCount++; m.ncBase += -r.base; m.ncIva += -r.iva;
        T.ncCount++; T.ncBase += -r.base; T.ncIva += -r.iva;
      }
      m.netIva += r.iva; m.netBase += r.base;
      T.netIva += r.iva; T.netBase += r.base;
      months.set(r.month, m);
    }
    const by_month = [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
    return { by_month, rows, totals: T };
  }, [data, filter]);

  const exportCsv = () => {
    if (!view) return;
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines: string[] = ['Mes,Fecha,Tipo doc,N° Factura,Cliente,Comprobante,Base,IVA,Total'];
    const byMonth = new Map<string, InvoiceRow[]>();
    for (const r of view.rows) { if (!byMonth.has(r.month)) byMonth.set(r.month, []); byMonth.get(r.month)!.push(r); }
    const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
    for (const month of months) {
      for (const r of byMonth.get(month)!) {
        lines.push([
          monthLabel(month), (r.issued_at || '').slice(0, 10),
          r.kind === 'nc' ? 'Nota de crédito' : 'Venta',
          esc(r.invoice_number), esc(r.customer_name),
          r.electronic ? 'Electrónica' : 'Corriente',
          r.base.toFixed(2), r.iva.toFixed(2), r.total.toFixed(2),
        ].join(','));
      }
      const mAgg = view.by_month.find(x => x.month === month)!;
      lines.push([`Subtotal ${monthLabel(month)}`, '', '', '', '', '', mAgg.netBase.toFixed(2), mAgg.netIva.toFixed(2), '', ].join(','));
      lines.push('');
    }
    const T = view.totals;
    lines.push(['TOTAL NETO', '', '', '', '', '', T.netBase.toFixed(2), T.netIva.toFixed(2), ''].join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `impuestos_${filter}_${from}_${to}.csv`;
    a.click();
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw size={22} className="animate-spin" /></div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{error}</div>;
  if (!view) return null;

  const T = view.totals;
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todas' }, { id: 'fe', label: 'Electrónica' }, { id: 'corriente', label: 'Corriente' },
  ];

  return (
    <div className="space-y-5">
      {/* Filtro */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${filter === f.id ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Receipt}    label="IVA ventas (débito)" value={fmt(T.vIva)}  color="bg-blue-500" />
        <KPI icon={FileText}   label="IVA notas crédito"   value={`-${fmt(T.ncIva)}`} color="bg-amber-500" />
        <KPI icon={Percent}    label="IVA neto a declarar" value={fmt(T.netIva)} color="bg-violet-500" />
        <KPI icon={DollarSign} label="Comprobantes"        value={`${T.vCount} vta · ${T.ncCount} NC`} color="bg-slate-500" />
      </div>

      {/* Cierre mensual */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-black text-gray-900">Cierre mensual de impuestos</h2>
            <p className="text-xs text-gray-400">IVA cobrado en ventas menos notas de crédito · tocá un mes para ver el detalle</p>
          </div>
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5">
            <Download size={13} /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-bold">Mes</th>
                <th className="text-right px-4 py-3 font-bold">Ventas</th>
                <th className="text-right px-4 py-3 font-bold">IVA ventas</th>
                <th className="text-right px-4 py-3 font-bold">NC</th>
                <th className="text-right px-4 py-3 font-bold">IVA NC</th>
                <th className="text-right px-5 py-3 font-bold">IVA neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {view.by_month.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Sin comprobantes en el período</td></tr>
              ) : view.by_month.map(m => {
                const open = expandedMonth === m.month;
                const rows = view.rows.filter(i => i.month === m.month);
                return (
                <React.Fragment key={m.month}>
                  <tr className="hover:bg-violet-50/40 cursor-pointer" onClick={() => setExpandedMonth(open ? null : m.month)}>
                    <td className="px-5 py-3 font-bold text-gray-900">
                      <span className="inline-flex items-center gap-1.5">
                        {open ? <ChevronDown size={14} className="text-violet-500" /> : <ChevronRight size={14} className="text-gray-400" />}
                        {monthLabel(m.month)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{m.vCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(m.vIva)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">{m.ncCount || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">{m.ncIva ? `-${fmt(m.ncIva)}` : '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-black text-violet-700">{fmt(m.netIva)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50/70 px-3 py-2">
                        <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase text-gray-400 border-b border-gray-100">
                              <tr>
                                <th className="text-left px-3 py-2">Fecha</th>
                                <th className="text-left px-3 py-2">Tipo</th>
                                <th className="text-left px-3 py-2">N° Factura</th>
                                <th className="text-left px-3 py-2">Cliente</th>
                                <th className="text-right px-3 py-2">Base</th>
                                <th className="text-right px-3 py-2">IVA</th>
                                <th className="text-right px-3 py-2">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {rows.map((r, i) => (
                                <tr key={i} className={`hover:bg-gray-50 ${r.kind === 'nc' ? 'bg-amber-50/40' : ''}`}>
                                  <td className="px-3 py-1.5 text-gray-500">{(r.issued_at || '').slice(0, 10)}</td>
                                  <td className="px-3 py-1.5">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.kind === 'nc' ? 'bg-amber-200 text-amber-800' : r.electronic ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {r.kind === 'nc' ? 'NC' : r.electronic ? 'FE' : 'Corr.'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 font-mono font-bold text-gray-800">{r.invoice_number || '—'}</td>
                                  <td className="px-3 py-1.5 text-gray-600 truncate max-w-40">{r.customer_name || '—'}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmt(r.base)}</td>
                                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${r.kind === 'nc' ? 'text-amber-700' : 'text-violet-700'}`}>{fmt(r.iva)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">{fmt(r.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
            </tbody>
            {view.by_month.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-black">
                <tr>
                  <td className="px-5 py-3">TOTAL</td>
                  <td className="px-4 py-3 text-right tabular-nums">{T.vCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(T.vIva)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">{T.ncCount || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">{T.ncIva ? `-${fmt(T.ncIva)}` : '—'}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-violet-700">{fmt(T.netIva)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        <b>IVA neto</b> = IVA cobrado en ventas − IVA de notas de crédito (débito fiscal). El IVA de compras (crédito fiscal) no está incluido.
      </p>
    </div>
  );
};

export default TaxReport;
