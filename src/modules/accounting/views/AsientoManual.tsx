'use client';

import React from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * CARGAR UN ASIENTO A MANO.
 *
 * El motor de asientos automáticos cubre ventas, gastos y compras. Lo que
 * queda afuera —el aporte del dueño, un préstamo, un ajuste del contador, la
 * provisión de aguinaldo— solo se puede meter a mano, y hasta ahora el
 * endpoint existía sin pantalla.
 *
 * ── La diferencia se muestra, no se arregla ──────────────────────────────
 * El botón de guardar queda apagado mientras el asiento no cuadre, y al lado
 * dice por cuánto y de qué lado falta. Autocompletar la diferencia en una
 * cuenta cualquiera haría que cuadre sin que nadie entienda qué registró.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const c2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

interface Linea { code: string; debe: string; haber: string; detalle: string }

const vacia = (): Linea => ({ code: '', debe: '', haber: '', detalle: '' });

export const AsientoManual: React.FC<{
  cuentas: any[];
  onCerrar: () => void;
  onListo: (msg: string) => void;
}> = ({ cuentas, onCerrar, onListo }) => {
  const [fecha, setFecha] = React.useState(hoyCR());
  const [descripcion, setDescripcion] = React.useState('');
  const [lineas, setLineas] = React.useState<Linea[]>([vacia(), vacia()]);
  const [error, setError] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);

  const movibles = cuentas.filter(c => c.postable && c.active !== false);

  const set = (i: number, k: keyof Linea, v: string) =>
    setLineas(ls => ls.map((l, j) => {
      if (j !== i) return l;
      /* Debe y haber son excluyentes: una línea con los dos no es una línea,
         son dos. Escribir en uno vacía el otro en vez de dejar al servidor
         rechazarlo después de llenar todo el formulario. */
      if (k === 'debe' && v) return { ...l, debe: v, haber: '' };
      if (k === 'haber' && v) return { ...l, haber: v, debe: '' };
      return { ...l, [k]: v };
    }));

  const totalDebe = c2(lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0));
  const totalHaber = c2(lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0));
  const diferencia = c2(totalDebe - totalHaber);
  const conMonto = lineas.filter(l => l.code && ((Number(l.debe) || 0) > 0 || (Number(l.haber) || 0) > 0));
  const puede = conMonto.length >= 2 && diferencia === 0 && !!fecha;

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      const r = await apiFetch<any>('/accounting/diario', {
        method: 'POST',
        body: JSON.stringify({
          fecha, descripcion,
          lineas: conMonto.map(l => ({
            code: l.code,
            debe: Number(l.debe) || 0,
            haber: Number(l.haber) || 0,
            detalle: l.detalle || null,
          })),
        }),
      });
      onListo(`Asiento #${r.numero} guardado por ${crc(totalDebe)}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onCerrar}>
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Asiento manual</h2>
            <p className="text-xs text-gray-500">
              Para lo que no sale de una venta, un gasto ni una compra: aportes, préstamos,
              provisiones, ajustes del contador.
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold text-gray-500">Descripción</label>
              <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
                placeholder="Aporte del socio para capital de trabajo"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="text-[11px] uppercase text-gray-500">
                <tr>
                  <th className="text-left py-1 font-bold w-[38%]">Cuenta</th>
                  <th className="text-left py-1 font-bold">Detalle</th>
                  <th className="text-right py-1 font-bold w-28">Debe</th>
                  <th className="text-right py-1 font-bold w-28">Haber</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-1">
                      <select value={l.code} onChange={e => set(i, 'code', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-1.5 py-1.5 text-sm">
                        <option value="">— cuenta —</option>
                        {movibles.map(c => (
                          <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-1">
                      <input value={l.detalle} onChange={e => set(i, 'detalle', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-1.5 py-1.5 text-sm" />
                    </td>
                    <td className="py-1 pr-1">
                      <input type="number" inputMode="decimal" value={l.debe}
                        onChange={e => set(i, 'debe', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-1.5 py-1.5 text-sm text-right tabular-nums" />
                    </td>
                    <td className="py-1 pr-1">
                      <input type="number" inputMode="decimal" value={l.haber}
                        onChange={e => set(i, 'haber', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-1.5 py-1.5 text-sm text-right tabular-nums" />
                    </td>
                    <td className="py-1 text-right">
                      {lineas.length > 2 && (
                        <button onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-black">
                  <td colSpan={2} className="py-2 text-xs text-gray-500">Totales</td>
                  <td className="py-2 text-right tabular-nums">{crc(totalDebe)}</td>
                  <td className="py-2 text-right tabular-nums">{crc(totalHaber)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button onClick={() => setLineas(ls => [...ls, vacia()])}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600">
            <Plus size={13} /> Otra línea
          </button>

          {diferencia !== 0 && (
            <p className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              El asiento no cuadra: falta {crc(Math.abs(diferencia))} del lado del
              {diferencia > 0 ? ' haber' : ' debe'}.
            </p>
          )}
          {diferencia === 0 && conMonto.length === 1 && (
            <p className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Un asiento necesita al menos dos cuentas: de dónde salió y a dónde entró.
            </p>
          )}
          {error && <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => void guardar()} disabled={!puede || guardando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
              {guardando && <Loader2 size={13} className="animate-spin" />} Guardar asiento
            </button>
            <button onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600">
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">
            Un asiento guardado no se borra: si quedó mal, se anula y el sistema hace el
            contra-asiento. Es lo que permite explicar después por qué cambió el balance. Un mes
            cerrado no acepta asientos nuevos.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AsientoManual;
