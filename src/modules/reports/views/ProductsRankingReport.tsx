'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, Download, FileSpreadsheet, TrendingUp, ArrowDownUp } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/utils/csv';
import { downloadXlsx } from '@/utils/xlsx';

interface Props { tenantId: string | null; from: string; to: string }

interface ProductSale {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
const fmtQty = (n: number) => Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 3 });

type SortKey = 'total_revenue' | 'total_qty' | 'product_name';

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

export const ProductsRankingReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [rows, setRows] = useState<ProductSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_revenue');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setError('');
    try {
      const res = await apiFetch<ProductSale[]>(`/reports/products/sales?from=${from}&to=${to}`);
      setRows(res ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar productos');
    } finally { setLoading(false); }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const search = q.trim().toLowerCase();
    const list = search
      ? rows.filter(r => (r.product_name ?? '').toLowerCase().includes(search))
      : rows;
    return [...list].sort((a, b) => {
      if (sortKey === 'product_name') return (a.product_name ?? '').localeCompare(b.product_name ?? '');
      return Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
    });
  }, [rows, sortKey, q]);

  const totals = useMemo(() => {
    let qty = 0, revenue = 0;
    for (const r of rows) { qty += Number(r.total_qty || 0); revenue += Number(r.total_revenue || 0); }
    return { count: rows.length, qty, revenue };
  }, [rows]);

  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  const exportRows = () => {
    const header = ['#', 'Producto', 'Cantidad vendida', 'Ingresos (₡)'];
    const body = sorted.map((r, i) => [i + 1, r.product_name, round2(r.total_qty), round2(r.total_revenue)]);
    const totalRow = ['', 'TOTAL', round2(totals.qty), round2(totals.revenue)];
    return { header, body, totalRow };
  };
  const dlCsv = () => { const { header, body, totalRow } = exportRows(); downloadCsv(`top_productos_${from}_${to}`, [header, ...body, [], totalRow]); };
  const dlXlsx = () => { const { header, body, totalRow } = exportRows(); downloadXlsx(`top_productos_${from}_${to}`, [{ name: 'Top productos', rows: [header, ...body, [], totalRow] }]); };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 gap-2"><RefreshCw size={18} className="animate-spin" /> Cargando productos…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI icon={Package}    label="Productos vendidos" value={String(totals.count)} color="bg-emerald-500" />
        <KPI icon={ArrowDownUp} label="Unidades totales"  value={fmtQty(totals.qty)}   color="bg-blue-500" />
        <KPI icon={TrendingUp}  label="Ingresos totales"   value={fmt(totals.revenue)}  color="bg-violet-500" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-black text-gray-900">Todos los productos vendidos</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…"
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 w-44" />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm bg-white font-bold text-gray-700">
            <option value="total_revenue">Por ingresos</option>
            <option value="total_qty">Por cantidad</option>
            <option value="product_name">Por nombre</option>
          </select>
          <button onClick={dlCsv} disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 disabled:opacity-40">
            <Download size={15} /> CSV
          </button>
          <button onClick={dlXlsx} disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40">
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-bold w-12">#</th>
              <th className="px-4 py-3 text-left font-bold">Producto</th>
              <th className="px-4 py-3 text-right font-bold">Cantidad</th>
              <th className="px-4 py-3 text-right font-bold">Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Sin ventas de productos en el período.</td></tr>
            ) : sorted.map((r, i) => (
              <tr key={r.product_id || i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-gray-400 font-bold tabular-nums">{i + 1}</td>
                <td className="px-4 py-2.5 text-gray-800 font-semibold">{r.product_name || 'Producto'}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmtQty(r.total_qty)}</td>
                <td className="px-4 py-2.5 text-right font-black text-emerald-600 tabular-nums">{fmt(r.total_revenue)}</td>
              </tr>
            ))}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-black">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-gray-900">TOTAL ({totals.count})</td>
                <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{fmtQty(totals.qty)}</td>
                <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">{fmt(totals.revenue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default ProductsRankingReport;
