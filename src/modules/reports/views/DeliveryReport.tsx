'use client';

import React, { useEffect, useState } from 'react';
import { Truck, RefreshCw, Percent } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Week { week: string; count: number; total: number; net: number; commission: number; }
interface Invoice { id: string; invoice_number: string; customer_name?: string | null; total: number; delivery_commission_pct?: number; delivery_net?: number; issued_at: string; }
interface Data { count: number; total: number; net: number; commission: number; weeks: Week[]; invoices: Invoice[]; }

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

interface Props { from: string; to: string; }

export const DeliveryReport: React.FC<Props> = ({ from, to }) => {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true); setErr('');
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    apiFetch<Data>(`/reports/delivery?${q.toString()}`)
      .then(setData)
      .catch(e => setErr(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  const weekLabel = (monday: string) => {
    try {
      const d = new Date(monday + 'T00:00:00');
      const end = new Date(d); end.setDate(end.getDate() + 6);
      const f = (x: Date) => x.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' });
      return `${f(d)} – ${f(end)}`;
    } catch { return monday; }
  };

  if (loading) return <div className="text-center py-14 text-gray-400">Cargando…</div>;
  if (err) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{err}</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Truck size={24} className="text-orange-600" /> Ventas por Delivery</h2>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={16} /></button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-400">Ventas delivery</p><p className="text-2xl font-black text-gray-900">{data.count}</p></div>
        <div className="bg-orange-50 rounded-xl border border-orange-100 p-4"><p className="text-xs font-bold text-orange-600">Total vendido</p><p className="text-2xl font-black text-orange-700">{fmt(data.total)}</p></div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4"><p className="text-xs font-bold text-red-600 flex items-center gap-1"><Percent size={13} /> Comisión</p><p className="text-2xl font-black text-red-700">{fmt(data.commission)}</p></div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4"><p className="text-xs font-bold text-emerald-600">Neto recibido</p><p className="text-2xl font-black text-emerald-700">{fmt(data.net)}</p></div>
      </div>

      {/* Por semana */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-black text-gray-800 text-sm">Por semana (lunes a domingo)</h3></div>
        {data.weeks.length === 0 ? (
          <p className="text-center py-10 text-gray-400">No hay ventas por delivery en el rango.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Semana</th>
                  <th className="text-right px-4 py-3">Ventas</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">Comisión</th>
                  <th className="text-right px-4 py-3">Neto</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks.map(w => (
                  <tr key={w.week} className="border-t border-gray-50">
                    <td className="px-4 py-2.5 font-bold text-gray-800">{weekLabel(w.week)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{w.count}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(w.total)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{fmt(w.commission)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-emerald-700">{fmt(w.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detalle */}
      {data.invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-black text-gray-800 text-sm">Detalle</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Factura</th>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">%</th>
                  <th className="text-right px-4 py-3">Neto</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map(i => (
                  <tr key={i.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{i.invoice_number}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{String(i.issued_at).slice(0, 10)}</td>
                    <td className="px-4 py-2 text-gray-600 truncate max-w-[160px]">{i.customer_name ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-900">{fmt(i.total)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{Number(i.delivery_commission_pct ?? 0)}%</td>
                    <td className="px-4 py-2 text-right font-bold text-emerald-700">{fmt(Number(i.delivery_net ?? i.total ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryReport;
