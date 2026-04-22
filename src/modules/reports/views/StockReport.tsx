import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Package, AlertTriangle, TrendingUp, Search, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

interface StockProduct {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  min_stock_level: number | null;
  unit_price: number;
  cost_price: number | null;
  category: { name: string } | null;
}

interface Props { tenantId: string | null }

export const StockReport: React.FC<Props> = ({ tenantId }) => {
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'ok' | 'zero'>('all');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, stock_quantity, min_stock_level, unit_price, cost_price, categories(name)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(
        (data ?? []).map((p: any) => ({
          ...p,
          category: Array.isArray(p.categories) ? p.categories[0] ?? null : p.categories,
        }))
      );
    } catch (e) {
      console.error('StockReport error:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const isLow = (p: StockProduct) => p.stock_quantity > 0 && p.stock_quantity <= (p.min_stock_level ?? 0);
  const isZero = (p: StockProduct) => p.stock_quantity === 0;
  const isOk = (p: StockProduct) => p.stock_quantity > (p.min_stock_level ?? 0);

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'low') return isLow(p);
    if (filter === 'zero') return isZero(p);
    if (filter === 'ok') return isOk(p);
    return true;
  });

  const totalValue = products.reduce((s, p) => s + p.stock_quantity * (p.cost_price ?? p.unit_price), 0);
  const lowCount = products.filter(isLow).length;
  const zeroCount = products.filter(isZero).length;

  // Top 10 by stock value for bar chart
  const topByValue = [...products]
    .sort((a, b) => (b.stock_quantity * (b.cost_price ?? b.unit_price)) - (a.stock_quantity * (a.cost_price ?? a.unit_price)))
    .slice(0, 10)
    .map(p => ({
      name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
      value: p.stock_quantity * (p.cost_price ?? p.unit_price),
    }));

  const exportCSV = () => {
    if (!filtered.length) return;
    const header = 'Nombre,SKU,Categoría,Stock,Mínimo,Precio,Valor Stock';
    const rows = filtered.map(p =>
      `${p.name},${p.sku ?? ''},${p.category?.name ?? ''},${p.stock_quantity},${p.min_stock_level ?? 0},${p.unit_price},${(p.stock_quantity * (p.cost_price ?? p.unit_price)).toFixed(0)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Package, label: 'Total productos', value: loading ? '—' : String(products.length), color: 'bg-blue-500' },
          { icon: TrendingUp, label: 'Valor en stock', value: loading ? '—' : fmt(totalValue), sub: 'costo total', color: 'bg-emerald-500' },
          { icon: AlertTriangle, label: 'Bajo mínimo', value: loading ? '—' : String(lowCount), sub: 'requieren reposición', color: lowCount > 0 ? 'bg-amber-500' : 'bg-gray-400' },
          { icon: AlertTriangle, label: 'Sin stock', value: loading ? '—' : String(zeroCount), color: zeroCount > 0 ? 'bg-red-500' : 'bg-gray-400' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-gray-900 font-black text-xl leading-tight">{value}</p>
              {sub && <p className="text-gray-400 text-xs">{sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Top by value chart */}
      {topByValue.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-900 mb-4">Top 10 por valor en stock</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topByValue} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} width={110} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Valor']} contentStyle={{ borderRadius: '10px', border: '1px solid #e5e7eb' }} />
              <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table with filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-black text-gray-900">Inventario actual</h2>
            <button onClick={exportCSV} disabled={!filtered.length} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition">
              <Download size={15} />Exportar CSV
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto o SKU…" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 transition" />
            </div>
            <div className="flex gap-1.5">
              {([['all', 'Todos'], ['ok', 'Normal'], ['low', 'Bajo mínimo'], ['zero', 'Sin stock']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFilter(val)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === val ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" />
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  {['Producto', 'SKU', 'Categoría', 'Stock', 'Mínimo', 'Precio', 'Valor'].map(h => (
                    <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide ${['Precio', 'Valor', 'Stock', 'Mínimo'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                  <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const stockVal = p.stock_quantity * (p.cost_price ?? p.unit_price);
                  const zero = isZero(p);
                  const low = isLow(p);
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50 transition ${zero ? 'bg-red-50/40' : low ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-5 py-3 font-semibold text-gray-800">{p.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.sku ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{p.category?.name ?? '—'}</td>
                      <td className={`px-5 py-3 text-right font-black text-lg ${zero ? 'text-red-600' : low ? 'text-amber-600' : 'text-emerald-600'}`}>{p.stock_quantity}</td>
                      <td className="px-5 py-3 text-right text-gray-500">{p.min_stock_level ?? 0}</td>
                      <td className="px-5 py-3 text-right text-gray-700">{fmt(p.unit_price)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(stockVal)}</td>
                      <td className="px-5 py-3 text-center">
                        {zero ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">Sin stock</span>
                        ) : low ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Bajo mínimo</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Normal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center">
            <Package size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No hay productos que coincidan</p>
          </div>
        )}
      </div>
    </div>
  );
};
