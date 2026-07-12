'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Package, Search, RefreshCw, Download } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ProdRow {
  id: string; name: string; sku?: string; sku2?: string | null;
  unit_price?: number; cost_price?: number; stock_quantity?: number; tracks_stock?: boolean;
  cabys_code?: string | null; iva_rate?: number | null;
  category?: string | null; unit_type?: string | null; supplier?: string | null;
  created_at?: string;
}

const fmt = (n?: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

export const TenantProductsModal: React.FC<{ owner: any; onClose: () => void }> = ({ owner, onClose }) => {
  const [rows, setRows] = useState<ProdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const r = await apiFetch<{ products: ProdRow[] }>(`/admin/tenants/${owner.id}/products`);
      setRows(r?.products ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar productos'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [owner.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || (p.sku2 ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const exportCSV = () => {
    const head = ['Nombre', 'SKU', 'SKU2', 'Precio', 'Costo', 'Stock', 'Categoria', 'Unidad', 'Proveedor', 'CABYS', 'IVA'];
    const lines = filtered.map(p => [
      (p.name ?? '').replace(/;/g, ','), p.sku ?? '', p.sku2 ?? '',
      String(p.unit_price ?? 0), String(p.cost_price ?? 0),
      p.tracks_stock === false ? '∞' : String(p.stock_quantity ?? 0),
      (p.category ?? '').replace(/;/g, ','), (p.unit_type ?? '').replace(/;/g, ','), (p.supplier ?? '').replace(/;/g, ','),
      p.cabys_code ?? '', String(p.iva_rate ?? ''),
    ].join(';'));
    const csv = '﻿' + [head.join(';'), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `productos-${owner.name ?? owner.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-black text-gray-900">Productos cargados</h2>
              <p className="text-xs text-gray-400">{owner.name} · {rows.length} producto(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <button onClick={exportCSV} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
            <Download size={14} /> CSV
          </button>
          <button onClick={load} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><RefreshCw size={18} className="animate-spin" /> Cargando…</div>
          ) : error ? (
            <div className="m-5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">Sin productos.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-[11px] font-bold text-gray-500 uppercase border-b border-gray-100">
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2">SKU / SKU2</th>
                  <th className="px-4 py-2 text-right">Precio</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2">Categoría</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2">CABYS · IVA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-semibold text-gray-800">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-gray-500 text-xs">{p.sku || '—'}{p.sku2 ? ` / ${p.sku2}` : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(p.unit_price)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.tracks_stock === false ? '∞' : (p.stock_quantity ?? 0)}</td>
                    <td className="px-4 py-2 text-gray-600">{p.category ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{p.supplier ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.cabys_code || '—'} · {p.iva_rate ?? 13}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-right shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export default TenantProductsModal;
