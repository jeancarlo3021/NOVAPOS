import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, Percent, DollarSign, RefreshCw, Download, ChevronRight, ChevronDown, FlaskConical, ShoppingBag } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface InvoiceRow {
  kind: 'venta' | 'nc' | 'nd';
  document_type: string;   // ticket | tiquete_electronico | factura_electronica | nota_credito | nota_debito
  invoice_number: string;
  customer_name: string;
  issued_at: string;
  month: string;           // YYYY-MM
  base: number;            // NC vienen en negativo
  iva: number;
  total: number;
  electronic: boolean;
}
interface PurchaseRow {
  clave: string; issuer_name: string; issuer_id: string;
  document_type: string; doc_date: string; month: string;
  base: number; iva: number; total: number;
}
interface TaxData { invoices: InvoiceRow[]; purchases: PurchaseRow[] }

interface MonthAgg {
  month: string;
  vCount: number; electronic: number; vSales: number; vBase: number; vIva: number;
  ncCount: number; ncBase: number; ncIva: number;
  ndCount: number; ndBase: number; ndIva: number;
  netIva: number; netBase: number;
}
interface Totals {
  vCount: number; electronic: number; vSales: number; vBase: number; vIva: number;
  ncCount: number; ncBase: number; ncIva: number;
  ndCount: number; ndBase: number; ndIva: number;
  netIva: number; netBase: number;
  purchCount: number; purchBase: number; purchIva: number;
}
interface Agg { by_month: MonthAgg[]; rows: InvoiceRow[]; totals: Totals }

interface Props { tenantId: string | null; from: string; to: string }
type Filter = 'all' | 'fe' | 'corriente';

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return m ? `${names[Number(m) - 1] ?? m} ${y}` : ym;
};
const docLabel: Record<string, string> = {
  ticket: 'Tiquete corriente', tiquete_electronico: 'Tiquete electrónico',
  factura_electronica: 'Factura electrónica', nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito',
};

// Genera y descarga un CSV (con BOM para Excel).
function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [header.join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

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
  const { planFeatures } = useAuth();
  const isAdmin = (planFeatures as any)?.admin_dashboard === true;
  const [data, setData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [env, setEnv] = useState<'production' | 'sandbox' | 'all'>('production');
  const [showDl, setShowDl] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setError('');
    try {
      const d = await apiFetch<TaxData>(`/reports/taxes?from=${from}&to=${to}&environment=${env}`);
      setData({ invoices: d?.invoices ?? [], purchases: d?.purchases ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar impuestos');
    } finally { setLoading(false); }
  }, [tenantId, from, to, env]);

  useEffect(() => { load(); }, [load]);

  // Cerrar el menú de descargas al hacer click afuera.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dlRef.current && !dlRef.current.contains(e.target as Node)) setShowDl(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Agrega por mes según el filtro (Todas / solo FE / solo Corriente).
  const view = useMemo<Agg | null>(() => {
    if (!data) return null;
    const rows = data.invoices.filter(i => filter === 'all' || (filter === 'fe' ? i.electronic : !i.electronic));
    const months = new Map<string, MonthAgg>();
    const T: Totals = { vCount: 0, electronic: 0, vSales: 0, vBase: 0, vIva: 0, ncCount: 0, ncBase: 0, ncIva: 0, ndCount: 0, ndBase: 0, ndIva: 0, netIva: 0, netBase: 0, purchCount: 0, purchBase: 0, purchIva: 0 };
    const blank = (m: string): MonthAgg => ({ month: m, vCount: 0, electronic: 0, vSales: 0, vBase: 0, vIva: 0, ncCount: 0, ncBase: 0, ncIva: 0, ndCount: 0, ndBase: 0, ndIva: 0, netIva: 0, netBase: 0 });
    for (const r of rows) {
      const m = months.get(r.month) ?? blank(r.month);
      if (r.kind === 'venta') {
        m.vCount++; m.vSales += r.total; m.vBase += r.base; m.vIva += r.iva; if (r.electronic) m.electronic++;
        T.vCount++; T.vSales += r.total; T.vBase += r.base; T.vIva += r.iva; if (r.electronic) T.electronic++;
      } else if (r.kind === 'nc') {   // negativos
        m.ncCount++; m.ncBase += -r.base; m.ncIva += -r.iva;
        T.ncCount++; T.ncBase += -r.base; T.ncIva += -r.iva;
      } else {   // nd (positivos)
        m.ndCount++; m.ndBase += r.base; m.ndIva += r.iva;
        T.ndCount++; T.ndBase += r.base; T.ndIva += r.iva;
      }
      m.netIva += r.iva; m.netBase += r.base;
      T.netIva += r.iva; T.netBase += r.base;
      months.set(r.month, m);
    }
    // Compras (crédito fiscal) — no dependen del filtro FE/corriente.
    for (const p of data.purchases) { T.purchCount++; T.purchBase += p.base; T.purchIva += p.iva; }
    const by_month = [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
    return { by_month, rows, totals: T };
  }, [data, filter]);

  // ── Descargas CSV por categoría ─────────────────────────────────────────────
  const dlInvoices = (label: string, pred: (r: InvoiceRow) => boolean, file: string) => {
    if (!data) return;
    const rows = data.invoices.filter(pred).sort((a, b) => (a.issued_at || '').localeCompare(b.issued_at || ''));
    downloadCsv(`${file}_${from}_${to}.csv`,
      ['Fecha', 'Tipo', 'N° Factura', 'Cliente', 'Base', 'IVA', 'Total'],
      rows.map(r => [(r.issued_at || '').slice(0, 10), docLabel[r.document_type] ?? label,
        r.invoice_number, r.customer_name, r.base.toFixed(2), r.iva.toFixed(2), r.total.toFixed(2)]));
    setShowDl(false);
  };
  const dlPurchases = () => {
    if (!data) return;
    downloadCsv(`compras_${from}_${to}.csv`,
      ['Fecha', 'Clave', 'Proveedor', 'Cédula', 'Base', 'IVA crédito', 'Total'],
      data.purchases.map(p => [(p.doc_date || '').slice(0, 10), p.clave, p.issuer_name, p.issuer_id,
        p.base.toFixed(2), p.iva.toFixed(2), p.total.toFixed(2)]));
    setShowDl(false);
  };

  const DL_OPTIONS: { label: string; count: number; run: () => void }[] = data ? [
    { label: 'Tiquetes electrónicos', count: data.invoices.filter(r => r.kind === 'venta' && r.document_type === 'tiquete_electronico').length,
      run: () => dlInvoices('Tiquete electrónico', r => r.kind === 'venta' && r.document_type === 'tiquete_electronico', 'tiquetes_electronicos') },
    { label: 'Facturas electrónicas', count: data.invoices.filter(r => r.kind === 'venta' && r.document_type === 'factura_electronica').length,
      run: () => dlInvoices('Factura electrónica', r => r.kind === 'venta' && r.document_type === 'factura_electronica', 'facturas_electronicas') },
    { label: 'Notas de crédito', count: data.invoices.filter(r => r.kind === 'nc').length,
      run: () => dlInvoices('Nota de crédito', r => r.kind === 'nc', 'notas_credito') },
    { label: 'Notas de débito', count: data.invoices.filter(r => r.kind === 'nd').length,
      run: () => dlInvoices('Nota de débito', r => r.kind === 'nd', 'notas_debito') },
    { label: 'Compras (crédito fiscal)', count: data.purchases.length, run: dlPurchases },
  ] : [];

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw size={22} className="animate-spin" /></div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{error}</div>;
  if (!view) return null;

  const T = view.totals;
  const aPagar = T.netIva - T.purchIva;   // IVA a pagar = débito neto − crédito de compras
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todas' }, { id: 'fe', label: 'Electrónica' }, { id: 'corriente', label: 'Corriente' },
  ];

  return (
    <div className="space-y-5">
      {/* Filtros + Descargas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${filter === f.id ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl p-1 w-fit">
            <span className="pl-2 pr-1 text-amber-600" title="Filtro de ambiente (solo admin)"><FlaskConical size={13} /></span>
            {([['production', 'Producción'], ['sandbox', 'QA / Pruebas'], ['all', 'Todos']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setEnv(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${env === id ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-600/70 hover:text-amber-700'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Menú de descargas por tipo de comprobante */}
        <div className="relative ml-auto" ref={dlRef}>
          <button onClick={() => setShowDl(v => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2">
            <Download size={14} /> Descargar CSV <ChevronDown size={13} />
          </button>
          {showDl && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
              {DL_OPTIONS.map((o, i) => (
                <button key={i} onClick={o.run} disabled={o.count === 0}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed border-b border-gray-50 last:border-0">
                  <span className="font-bold text-gray-700">{o.label}</span>
                  <span className="text-[11px] text-gray-400">{o.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin && env === 'sandbox' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl px-4 py-2 flex items-center gap-2">
          <FlaskConical size={14} /> Mostrando SOLO comprobantes de QA / pruebas (sin validez fiscal).
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Receipt}    label="IVA débito (ventas+ND−NC)" value={fmt(T.netIva)}   color="bg-blue-500" />
        <KPI icon={ShoppingBag} label="IVA crédito (compras)"     value={fmt(T.purchIva)} color="bg-emerald-500" />
        <KPI icon={Percent}    label="IVA a pagar"                value={fmt(aPagar)}     color="bg-violet-500" />
        <KPI icon={DollarSign} label="Comprobantes"               value={`${T.vCount} vta · ${T.ncCount} NC · ${T.ndCount} ND`} color="bg-slate-500" />
      </div>

      {/* Cierre mensual */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-black text-gray-900">Cierre mensual de impuestos</h2>
            <p className="text-xs text-gray-400">IVA de ventas + notas de débito − notas de crédito · tocá un mes para ver el detalle</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-bold">Mes</th>
                <th className="text-right px-4 py-3 font-bold">Ventas</th>
                <th className="text-right px-4 py-3 font-bold">IVA ventas</th>
                <th className="text-right px-4 py-3 font-bold">ND</th>
                <th className="text-right px-4 py-3 font-bold">NC</th>
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
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{m.ndCount ? `+${fmt(m.ndIva)}` : '—'}</td>
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
                                <tr key={i} className={`hover:bg-gray-50 ${r.kind === 'nc' ? 'bg-amber-50/40' : r.kind === 'nd' ? 'bg-emerald-50/40' : ''}`}>
                                  <td className="px-3 py-1.5 text-gray-500">{(r.issued_at || '').slice(0, 10)}</td>
                                  <td className="px-3 py-1.5">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.kind === 'nc' ? 'bg-amber-200 text-amber-800' : r.kind === 'nd' ? 'bg-emerald-200 text-emerald-800' : r.document_type === 'factura_electronica' ? 'bg-blue-100 text-blue-700' : r.document_type === 'tiquete_electronico' ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {r.kind === 'nc' ? 'NC' : r.kind === 'nd' ? 'ND' : r.document_type === 'factura_electronica' ? 'FE' : r.document_type === 'tiquete_electronico' ? 'TE' : 'Corr.'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 font-mono font-bold text-gray-800">{r.invoice_number || '—'}</td>
                                  <td className="px-3 py-1.5 text-gray-600 truncate max-w-40">{r.customer_name || '—'}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmt(r.base)}</td>
                                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${r.kind === 'nc' ? 'text-amber-700' : r.kind === 'nd' ? 'text-emerald-700' : 'text-violet-700'}`}>{fmt(r.iva)}</td>
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
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{T.ndIva ? `+${fmt(T.ndIva)}` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">{T.ncIva ? `-${fmt(T.ncIva)}` : '—'}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-violet-700">{fmt(T.netIva)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Compras (crédito fiscal) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-black text-gray-900 flex items-center gap-1.5"><ShoppingBag size={16} className="text-emerald-600" /> Compras (crédito fiscal)</h2>
            <p className="text-xs text-gray-400">Comprobantes electrónicos recibidos de proveedores · {T.purchCount} documento(s)</p>
          </div>
          <button onClick={dlPurchases} disabled={T.purchCount === 0}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 rounded-lg px-3 py-1.5">
            <Download size={13} /> CSV
          </button>
        </div>
        {T.purchCount === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin compras electrónicas en el período.</div>
        ) : (
          <div className="px-5 py-3 flex flex-wrap gap-6">
            <div><p className="text-[11px] text-gray-400 uppercase font-bold">Base</p><p className="text-lg font-black text-gray-800">{fmt(T.purchBase)}</p></div>
            <div><p className="text-[11px] text-gray-400 uppercase font-bold">IVA crédito</p><p className="text-lg font-black text-emerald-700">{fmt(T.purchIva)}</p></div>
            <div><p className="text-[11px] text-gray-400 uppercase font-bold">Total</p><p className="text-lg font-black text-gray-800">{fmt(T.purchBase + T.purchIva)}</p></div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        <b>IVA a pagar</b> = IVA débito (ventas + notas de débito − notas de crédito) − IVA crédito (compras electrónicas de proveedores).
      </p>
    </div>
  );
};

export default TaxReport;
