import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ShoppingCart, Truck, DollarSign, Clock, Download, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

interface Purchase {
  id: string;
  purchase_number: string;
  purchase_date: string;
  status: 'pending' | 'received' | 'cancelled';
  total_amount: number;
  notes: string | null;
  supplier: { name: string } | null;
  items_count: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', received: 'Recibida', cancelled: 'Cancelada',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

interface Props { tenantId: string | null; from: string; to: string }

export const PurchasesReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          id, purchase_number, purchase_date, status, total_amount, notes,
          supplier:suppliers(name),
          items:purchase_items(id)
        `)
        .eq('tenant_id', tenantId)
        .gte('purchase_date', from)
        .lte('purchase_date', to)
        .order('purchase_date', { ascending: false });

      if (error) throw error;
      setPurchases(
        (data ?? []).map((p: any) => ({
          ...p,
          supplier: Array.isArray(p.supplier) ? p.supplier[0] ?? null : p.supplier,
          items_count: Array.isArray(p.items) ? p.items.length : 0,
        }))
      );
    } catch (e) {
      console.error('PurchasesReport error:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  // Aggregations
  const totalSpent = purchases.filter(p => p.status === 'received').reduce((s, p) => s + Number(p.total_amount), 0);
  const pending = purchases.filter(p => p.status === 'pending');
  const received = purchases.filter(p => p.status === 'received');

  // By supplier bar chart
  const supplierMap: Record<string, number> = {};
  purchases.filter(p => p.status === 'received').forEach(p => {
    const name = p.supplier?.name ?? 'Sin proveedor';
    supplierMap[name] = (supplierMap[name] ?? 0) + Number(p.total_amount);
  });
  const supplierBars = Object.entries(supplierMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, total]) => ({ name: name.length > 14 ? name.slice(0, 14) + '…' : name, total }));

  const exportCSV = () => {
    if (!purchases.length) return;
    const header = 'Número,Fecha,Proveedor,Estado,Total,Items';
    const rows = purchases.map(p =>
      `${p.purchase_number},${p.purchase_date},${p.supplier?.name ?? ''},${STATUS_LABELS[p.status]},${p.total_amount},${p.items_count}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, label: 'Total recibido', value: loading ? '—' : fmt(totalSpent), sub: `${received.length} compras`, color: 'bg-emerald-500' },
          { icon: ShoppingCart, label: 'Total compras', value: loading ? '—' : String(purchases.length), color: 'bg-blue-500' },
          { icon: Clock, label: 'Pendientes', value: loading ? '—' : String(pending.length), sub: fmt(pending.reduce((s, p) => s + Number(p.total_amount), 0)), color: 'bg-amber-500' },
          { icon: Truck, label: 'Recibidas', value: loading ? '—' : String(received.length), color: 'bg-violet-500' },
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

      {/* By supplier chart */}
      {supplierBars.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-900 mb-4">Gasto por proveedor</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={supplierBars} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} width={100} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Total']} contentStyle={{ borderRadius: '10px', border: '1px solid #e5e7eb' }} />
              <Bar dataKey="total" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Purchases table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-gray-900">Órdenes de compra</h2>
            <p className="text-xs text-gray-400 mt-0.5">{purchases.length} registros</p>
          </div>
          <button
            onClick={exportCSV}
            disabled={!purchases.length}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition"
          >
            <Download size={15} />Exportar CSV
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-500" />
          </div>
        ) : purchases.length ? (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  {['Número', 'Fecha', 'Proveedor', 'Items', 'Estado', 'Total'].map(h => (
                    <th key={h} className={`px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide ${h === 'Total' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {purchases.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 font-mono text-xs font-bold text-gray-700">{p.purchase_number}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{new Date(p.purchase_date).toLocaleDateString('es-CR')}</td>
                    <td className="px-5 py-3 text-gray-700 font-medium">{p.supplier?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-center">{p.items_count}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold border px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
                        {p.status === 'received' ? <CheckCircle size={11} /> : p.status === 'cancelled' ? <XCircle size={11} /> : <Clock size={11} />}
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-black text-gray-900">{fmt(Number(p.total_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center">
            <ShoppingCart size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Sin compras en el período seleccionado</p>
          </div>
        )}
      </div>
    </div>
  );
};
