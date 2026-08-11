'use client';

import React, { useEffect, useState } from 'react';
import { ChefHat, RefreshCw, Star, Milk, HelpCircle, Dog, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * Análisis de menú (menu engineering).
 *
 * Cruza dos cosas que el sistema ya tenía por separado y nunca juntaba: el COSTO
 * de la receta y las VENTAS del producto. De ahí sale el cuadrante clásico, que
 * es el reporte que un dueño de restaurante realmente mira:
 *
 *   ESTRELLA  se vende y deja  → no tocarlo, destacarlo en la carta
 *   VACA      se vende, deja poco → subir precio o bajar costo, con cuidado
 *   ENIGMA    deja pero no se vende → empujarlo: ahí está la plata
 *   PERRO     ni se vende ni deja → sacarlo de la carta
 *
 * El corte es la MEDIA del período, no un número fijo: un plato es "popular"
 * respecto de los demás platos del mismo local.
 */

interface Row {
  product_id: string; name: string; qty: number;
  revenue: number; cost: number; margin: number; cost_pct: number;
  estimated: boolean; classification: 'estrella' | 'vaca' | 'enigma' | 'perro';
}
interface Data {
  rows: Row[];
  totals: { revenue: number; cost: number; margin: number };
  cuts: { avg_qty: number; avg_margin_per_unit: number };
}

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;

const CLASS_META = {
  estrella: { label: 'Estrella', icon: Star,       cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', hint: 'Se vende y deja. No lo toques: destacalo.' },
  vaca:     { label: 'Vaca',     icon: Milk,       cls: 'bg-blue-100 text-blue-700 border-blue-200',          hint: 'Se vende pero deja poco. Subí precio o bajá costo, con cuidado.' },
  enigma:   { label: 'Enigma',   icon: HelpCircle, cls: 'bg-amber-100 text-amber-700 border-amber-200',       hint: 'Deja pero no se vende. Empujalo: ahí está la plata.' },
  perro:    { label: 'Perro',    icon: Dog,        cls: 'bg-red-100 text-red-700 border-red-200',             hint: 'Ni se vende ni deja. Candidato a salir de la carta.' },
} as const;

interface Props { from: string; to: string }

export const MenuEngineeringReport: React.FC<Props> = ({ from, to }) => {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true); setErr('');
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    apiFetch<Data>(`/recipes/reports/menu-engineering?${q.toString()}`)
      .then(setData)
      .catch(e => setErr(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  if (loading) return <div className="py-16 text-center text-gray-400">Cargando…</div>;
  if (err) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{err}</div>;
  if (!data) return null;

  const anyEstimated = data.rows.some(r => r.estimated);
  const foodCostPct = data.totals.revenue > 0 ? (data.totals.cost / data.totals.revenue) * 100 : 0;
  const counts = (k: Row['classification']) => data.rows.filter(r => r.classification === k).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <ChefHat size={24} className="text-orange-600" /> Análisis de menú
        </h2>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={16} /></button>
      </div>

      {/* El costo estimado NO es dato histórico: hay que decirlo, no dejar que
          se descubra cuando alguien tome una decisión con él. */}
      {anyEstimated && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            Algunos platos se costearon con el precio de <b>hoy</b> porque su venta es anterior a que
            se empezara a congelar el costo. Van marcados como <b>estimado</b>: sirven de referencia,
            no de dato histórico exacto.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-400">Venta</p>
          <p className="text-2xl font-black text-gray-900">{fmt(data.totals.revenue)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4">
          <p className="text-xs font-bold text-red-600">Costo</p>
          <p className="text-2xl font-black text-red-700">{fmt(data.totals.cost)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
          <p className="text-xs font-bold text-emerald-600">Margen</p>
          <p className="text-2xl font-black text-emerald-700">{fmt(data.totals.margin)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-100 p-4">
          <p className="text-xs font-bold text-orange-600">Food cost</p>
          <p className="text-2xl font-black text-orange-700">{foodCostPct.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-500">Platos</p>
          <p className="text-2xl font-black text-gray-800">{data.rows.length}</p>
        </div>
      </div>

      {/* Cuadrantes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(CLASS_META) as Array<Row['classification']>).map(k => {
          const meta = CLASS_META[k];
          const Icon = meta.icon;
          return (
            <div key={k} className={`rounded-xl border p-4 ${meta.cls}`}>
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                <Icon size={14} /> {meta.label}
              </p>
              <p className="text-3xl font-black mt-1">{counts(k)}</p>
              <p className="text-[11px] mt-1 opacity-80">{meta.hint}</p>
            </div>
          );
        })}
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-black text-gray-800 text-sm">Detalle por plato</h3>
          <p className="text-[11px] text-gray-400">
            Cortes del período: {data.cuts.avg_qty.toFixed(1)} unidades vendidas y{' '}
            {fmt(data.cuts.avg_margin_per_unit)} de margen por unidad.
          </p>
        </div>
        {data.rows.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">No hay ventas de platos con receta en el rango.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Plato</th>
                  <th className="text-right px-4 py-3">Vendidos</th>
                  <th className="text-right px-4 py-3">Venta</th>
                  <th className="text-right px-4 py-3">Costo</th>
                  <th className="text-right px-4 py-3">Margen</th>
                  <th className="text-right px-4 py-3">Food cost</th>
                  <th className="text-center px-4 py-3">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => {
                  const meta = CLASS_META[r.classification];
                  const Icon = meta.icon;
                  return (
                    <tr key={r.product_id} className="border-t border-gray-50">
                      <td className="px-4 py-2 text-gray-800 font-semibold">
                        {r.name}
                        {r.estimated && (
                          <span className="ml-1.5 text-[9px] font-black uppercase text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                            estimado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600 tabular-nums">{r.qty.toFixed(0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900 tabular-nums">{fmt(r.revenue)}</td>
                      <td className="px-4 py-2 text-right text-red-600 tabular-nums">{fmt(r.cost)}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-700 tabular-nums">{fmt(r.margin)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-bold ${
                        r.cost_pct > 40 ? 'text-red-600' : r.cost_pct > 30 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {r.cost_pct.toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${meta.cls}`}>
                          <Icon size={10} /> {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuEngineeringReport;
