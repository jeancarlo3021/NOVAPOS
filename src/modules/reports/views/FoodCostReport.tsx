'use client';

import React, { useEffect, useState } from 'react';
import { Scale, RefreshCw, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * Food cost: consumo teórico contra consumo real.
 *
 * El consumo REAL no se recalcula sumando movimientos — se arma de lo que ya
 * está registrado:
 *
 *   real = teórico (recetas) + merma registrada + varianza del conteo
 *
 * La varianza sale del ajuste tipo 'count' de la toma física, que ya guarda la
 * diferencia entre lo contado y lo que el sistema creía. Ese número YA tiene
 * descontadas las ventas, las compras y las mermas, así que es exactamente lo
 * NO EXPLICADO: lo que hay que ir a buscar.
 */

interface Row {
  product_id: string; name: string; unit_cost: number;
  theo_qty: number; theo_cost: number;
  waste_qty: number; waste_cost: number;
  var_qty: number; var_cost: number;
  counted_at: string | null;
}
interface Data {
  rows: Row[];
  available: boolean;
  message?: string;
  counted: number;
  totals: { theoretical: number; waste: number; variance: number; real: number; leak_pct: number };
}

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;
const qty = (n: number) => Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 });

interface Props { from: string; to: string }

export const FoodCostReport: React.FC<Props> = ({ from, to }) => {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true); setErr('');
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    apiFetch<Data>(`/recipes/reports/food-cost?${q.toString()}`)
      .then(setData)
      .catch(e => setErr(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  if (loading) return <div className="py-16 text-center text-gray-400">Cargando…</div>;
  if (err) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{err}</div>;
  if (!data) return null;

  if (!data.available) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        No hay datos de consumo todavía. {data.message}
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Scale size={24} className="text-teal-600" /> Food cost · teórico vs. real
        </h2>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={16} /></button>
      </div>

      {/* Sin toma física no hay varianza que mostrar, y decirlo importa: un
          reporte con la columna en cero se lee como "no hay fugas". */}
      {data.counted === 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <ClipboardCheck size={15} className="shrink-0 mt-0.5" />
          <span>
            No hay ninguna <b>toma física</b> en este rango, así que la varianza aparece en cero —
            y eso no significa que no haya fugas, significa que nadie contó. Hacé una toma en
            Inventario → Stock para que este reporte tenga la mitad que falta.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-400">Consumo teórico</p>
          <p className="text-2xl font-black text-gray-900">{fmt(t.theoretical)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">lo que dicen las recetas</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
          <p className="text-xs font-bold text-amber-600">Merma registrada</p>
          <p className="text-2xl font-black text-amber-700">{fmt(t.waste)}</p>
          <p className="text-[10px] text-amber-600/70 mt-0.5">con motivo declarado</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4">
          <p className="text-xs font-bold text-red-600">Varianza</p>
          <p className="text-2xl font-black text-red-700">{fmt(t.variance)}</p>
          <p className="text-[10px] text-red-600/70 mt-0.5">sin explicar</p>
        </div>
        <div className="bg-teal-50 rounded-xl border border-teal-100 p-4">
          <p className="text-xs font-bold text-teal-700">Consumo real</p>
          <p className="text-2xl font-black text-teal-800">{fmt(t.real)}</p>
          <p className="text-[10px] text-teal-700/70 mt-0.5">teórico + merma + varianza</p>
        </div>
        <div className={`rounded-xl border p-4 ${
          t.leak_pct > 10 ? 'bg-red-50 border-red-100' : t.leak_pct > 5 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'
        }`}>
          <p className={`text-xs font-bold ${t.leak_pct > 10 ? 'text-red-600' : t.leak_pct > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>Fuga</p>
          <p className={`text-2xl font-black ${t.leak_pct > 10 ? 'text-red-700' : t.leak_pct > 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {t.leak_pct.toFixed(1)}%
          </p>
          <p className="text-[10px] opacity-70 mt-0.5">sobre el teórico</p>
        </div>
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-black text-gray-800 text-sm">Por ingrediente</h3>
          <p className="text-[11px] text-gray-400">
            Ordenado por lo que más se está perdiendo: merma más varianza.
          </p>
        </div>
        {data.rows.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">Sin movimiento de ingredientes en el rango.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Ingrediente</th>
                  <th className="text-right px-4 py-3">Teórico</th>
                  <th className="text-right px-4 py-3">Merma</th>
                  <th className="text-right px-4 py-3">Varianza</th>
                  <th className="text-right px-4 py-3">Perdido</th>
                  <th className="text-center px-4 py-3">Contado</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => {
                  const lost = r.waste_cost + r.var_cost;
                  return (
                    <tr key={r.product_id} className="border-t border-gray-50">
                      <td className="px-4 py-2 text-gray-800 font-semibold">{r.name}</td>
                      <td className="px-4 py-2 text-right text-gray-600 tabular-nums">
                        {qty(r.theo_qty)}
                        <span className="block text-[10px] text-gray-400">{fmt(r.theo_cost)}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.waste_qty > 0 ? (
                          <>
                            <span className="text-amber-700 font-bold">{qty(r.waste_qty)}</span>
                            <span className="block text-[10px] text-amber-600">{fmt(r.waste_cost)}</span>
                          </>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.var_qty !== 0 ? (
                          <>
                            <span className={`font-bold ${r.var_qty < 0 ? 'text-red-700' : 'text-blue-700'}`}>
                              {qty(r.var_qty)}
                            </span>
                            <span className={`block text-[10px] ${r.var_qty < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                              {r.var_qty < 0 ? 'faltó' : 'sobró'} · {fmt(Math.abs(r.var_cost))}
                            </span>
                          </>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-2 text-right font-black tabular-nums ${
                        lost > 0 ? 'text-red-700' : 'text-gray-300'
                      }`}>
                        {lost > 0 ? fmt(lost) : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.counted_at ? (
                          <span className="text-[10px] text-gray-500">{String(r.counted_at).slice(0, 10)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600" title="Este ingrediente no se ha contado: su varianza es desconocida, no cero.">
                            <AlertTriangle size={10} /> sin contar
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
    </div>
  );
};

export default FoodCostReport;
