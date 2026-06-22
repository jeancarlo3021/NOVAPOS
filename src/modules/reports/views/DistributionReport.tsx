import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Truck, Route as RouteIcon } from 'lucide-react';
import { distributionService } from '@/services/distribution/distributionService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

interface Props { tenantId: string | null; from: string; to: string; }

export const DistributionReport: React.FC<Props> = ({ from, to }) => {
  const [data, setData] = useState<{ routes: any[]; trucks: any[]; by_method?: { cash: number; card: number; sinpe: number; credit: number } } | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    try { setData(await distributionService.report(from, to)); }
    catch { setData({ routes: [], trucks: [] }); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { run(); }, [run]);

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;

  const routes = data?.routes ?? [];
  const trucks = data?.trucks ?? [];
  const byMethod = data?.by_method ?? { cash: 0, card: 0, sinpe: 0, credit: 0 };
  const totalSales = routes.reduce((s, r) => s + Number(r.sales_total || 0), 0);
  const totalCount = routes.reduce((s, r) => s + Number(r.sales_count || 0), 0);
  const totalVoids = routes.reduce((s, r) => s + Number(r.voids_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Por método de pago */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([['Efectivo', byMethod.cash, 'text-emerald-600'], ['Tarjeta', byMethod.card, 'text-blue-600'], ['SINPE', byMethod.sinpe, 'text-violet-600'], ['Crédito', byMethod.credit, 'text-amber-600']] as const).map(([label, val, cls]) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{label}</p>
            <p className={`text-lg font-black ${cls}`}>{fmt(val)}</p>
          </div>
        ))}
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Total vendido</p>
          <p className="text-xl font-black text-emerald-600">{fmt(totalSales)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Ventas</p>
          <p className="text-xl font-black text-gray-900">{totalCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Anulaciones</p>
          <p className="text-xl font-black text-rose-600">{totalVoids}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Rutas</p>
          <p className="text-xl font-black text-gray-900">{routes.length}</p>
        </div>
      </div>

      {/* Por camión */}
      <div>
        <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><Truck size={16} className="text-cyan-600" /> Por camión</h3>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Camión</th>
                <th className="text-right px-4 py-2 font-bold">Rutas</th>
                <th className="text-right px-4 py-2 font-bold">Ventas</th>
                <th className="text-right px-4 py-2 font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {trucks.map((t, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-semibold text-gray-800">{t.truck}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{t.routes}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{t.sales_count}</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-600">{fmt(t.sales_total)}</td>
                </tr>
              ))}
              {trucks.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-6">Sin datos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por ruta */}
      <div>
        <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><RouteIcon size={16} className="text-cyan-600" /> Por ruta</h3>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Fecha</th>
                <th className="text-left px-4 py-2 font-bold">Camión</th>
                <th className="text-left px-4 py-2 font-bold">Repartidor</th>
                <th className="text-right px-3 py-2 font-bold text-emerald-600">Efectivo</th>
                <th className="text-right px-3 py-2 font-bold text-blue-600">Tarjeta</th>
                <th className="text-right px-3 py-2 font-bold text-violet-600">SINPE</th>
                <th className="text-right px-3 py-2 font-bold text-amber-600">Crédito</th>
                <th className="text-right px-4 py-2 font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {routes.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-gray-600">{r.route_date}</td>
                  <td className="px-4 py-2 font-semibold text-gray-800">{r.truck}</td>
                  <td className="px-4 py-2 text-gray-600">{r.driver || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(r.cash)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(r.card)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(r.sinpe)}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{fmt(r.credit)}</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-600">{fmt(r.sales_total)}</td>
                </tr>
              ))}
              {routes.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-6">Sin rutas en el período</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DistributionReport;
