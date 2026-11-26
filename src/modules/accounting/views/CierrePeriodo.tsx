'use client';

import React from 'react';
import { Loader2, Lock, Unlock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * CIERRE DE PERÍODO.
 *
 * ── Qué hace cerrar un mes ───────────────────────────────────────────────
 * Dos cosas, y las dos juntas:
 *   1. manda el resultado del mes a resultados acumulados, que es lo que
 *      vacía las cuentas de ingreso y gasto para que el mes siguiente
 *      empiece de cero;
 *   2. traba la fecha: no entran asientos nuevos con fecha de ese mes.
 *
 * Lo segundo es lo que vale. Cerrar sin trabar es un asiento decorativo: el
 * informe que se declaró cambia igual mañana cuando alguien contabilice una
 * factura atrasada, y nadie se entera hasta que Hacienda pregunta.
 *
 * ── Y qué hace REABRIR ───────────────────────────────────────────────────
 * Borra el asiento de cierre, no lo anula. Un contra-asiento se fecharía hoy
 * y devolvería los ingresos de marzo al mes en que se reabrió: el estado de
 * resultados de los dos meses quedaría mal. El asiento de cierre no respalda
 * ningún hecho económico —lo armó el sistema a partir de los demás— así que
 * borrarlo no pierde nada: cerrar otra vez lo vuelve a generar idéntico.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

const mesPasado = () => {
  const [a, m] = hoyCR().split('-').map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
};

export const CierrePeriodo: React.FC = () => {
  const [lista, setLista] = React.useState<any>(null);
  const [periodo, setPeriodo] = React.useState(mesPasado());
  const [previo, setPrevio] = React.useState<any>(null);
  const [cargando, setCargando] = React.useState(true);
  const [mirando, setMirando] = React.useState(false);
  const [cerrando, setCerrando] = React.useState(false);
  const [error, setError] = React.useState('');
  const [aviso, setAviso] = React.useState('');

  const cargar = async () => {
    setCargando(true);
    try { setLista(await apiFetch<any>('/accounting/cierre', {}, 30000)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  };
  React.useEffect(() => { void cargar(); }, []);

  React.useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(periodo)) { setPrevio(null); return; }
    let vivo = true;
    setMirando(true); setPrevio(null); setError('');
    apiFetch<any>(`/accounting/cierre/${periodo}/previo`, {}, 60000)
      .then(r => { if (vivo) setPrevio(r); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo calcular'); })
      .finally(() => { if (vivo) setMirando(false); });
    return () => { vivo = false; };
  }, [periodo]);

  const yaCerrado = (lista?.periodos ?? []).find((p: any) => p.periodo === periodo);
  const terminado = periodo < hoyCR().slice(0, 7);

  const cerrar = async () => {
    if (!confirm(`¿Cerrar ${periodo}?\n\n`
      + `Se asienta la utilidad del mes contra resultados acumulados y el mes deja de aceptar `
      + `asientos nuevos. Se puede reabrir después, pero mientras esté cerrado nadie puede `
      + `contabilizar una factura atrasada con fecha de ese mes.`)) return;
    setCerrando(true); setError(''); setAviso('');
    try {
      const r = await apiFetch<any>('/accounting/cierre', {
        method: 'POST', body: JSON.stringify({ periodo }),
      }, 60000);
      setAviso(`${periodo} queda cerrado con el asiento #${r.asiento.numero}. `
        + `${r.utilidad >= 0 ? 'Utilidad' : 'Pérdida'} del mes: ${crc(Math.abs(r.utilidad))}.`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cerrar'); }
    finally { setCerrando(false); }
  };

  const reabrir = async (p: string) => {
    if (!confirm(`¿Reabrir ${p}?\n\n`
      + 'Se BORRA el asiento de cierre de ese mes y vuelve a aceptar asientos. El asiento se puede '
      + 'volver a generar idéntico cerrando otra vez, así que no se pierde nada; lo que cambia es '
      + 'que los informes de ese mes pueden dejar de dar lo que ya se declaró.')) return;
    setError(''); setAviso('');
    try {
      await apiFetch(`/accounting/cierre/${p}/reabrir`, { method: 'POST' });
      setAviso(`${p} quedó abierto otra vez.`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reabrir'); }
  };

  if (cargando) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>;

  if (lista?.sin_tabla) {
    return (
      <p className="text-sm text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 max-w-2xl">
        Falta correr la migración <b>148_contabilidad_ramas.sql</b>. Crea el registro de los meses
        cerrados — y es ese registro el que traba la fecha. Sin él, el cierre sería un asiento que no
        protege nada.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-bold text-gray-500">Mes a cerrar</label>
            <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          {!yaCerrado && terminado && (
            <button onClick={() => void cerrar()} disabled={cerrando || !previo || !previo.filas?.length}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
              {cerrando ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              Cerrar {periodo}
            </button>
          )}
          {yaCerrado && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <CheckCircle2 size={13} /> {periodo} ya está cerrado
            </span>
          )}
          {!terminado && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <AlertTriangle size={13} /> {periodo} todavía no termina
            </span>
          )}
        </div>

        {mirando && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Calculando el resultado del mes…</p>}

        {previo && !mirando && (
          previo.filas.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay ingresos ni gastos registrados en {periodo}: no hay nada que cerrar.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-[11px] font-bold text-gray-500">Ingresos</p>
                  <p className="text-lg font-black tabular-nums text-emerald-700">{crc(previo.ingresos)}</p></div>
                <div><p className="text-[11px] font-bold text-gray-500">Costos y gastos</p>
                  <p className="text-lg font-black tabular-nums text-gray-800">{crc(previo.gastos)}</p></div>
                <div><p className="text-[11px] font-bold text-gray-500">
                  {previo.utilidad >= 0 ? 'Utilidad del mes' : 'Pérdida del mes'}</p>
                  <p className={`text-lg font-black tabular-nums ${previo.utilidad >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {crc(Math.abs(previo.utilidad))}</p></div>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer font-bold text-indigo-600">
                  Ver el asiento que se va a hacer ({previo.filas.length + 1} líneas, con fecha {previo.fecha_asiento})
                </summary>
                <table className="w-full mt-2">
                  <tbody>
                    {previo.filas.map((f: any) => (
                      <tr key={f.code} className="border-t border-gray-50">
                        <td className="py-0.5 font-mono text-gray-400 w-14">{f.code}</td>
                        <td className="py-0.5 text-gray-700">{f.name}</td>
                        <td className="py-0.5 text-right tabular-nums w-24">
                          {f.type === 'ingreso' ? crc(Math.abs(f.saldo)) : ''}
                        </td>
                        <td className="py-0.5 text-right tabular-nums w-24 text-gray-500">
                          {f.type === 'gasto' ? crc(Math.abs(f.saldo)) : ''}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-200 font-bold">
                      <td className="py-0.5 font-mono text-gray-400">3102</td>
                      <td className="py-0.5 text-gray-700">Resultados acumulados</td>
                      <td className="py-0.5 text-right tabular-nums">
                        {previo.utilidad < 0 ? crc(-previo.utilidad) : ''}</td>
                      <td className="py-0.5 text-right tabular-nums text-gray-500">
                        {previo.utilidad >= 0 ? crc(previo.utilidad) : ''}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 mt-1">Primera columna de montos: debe. Segunda: haber.</p>
              </details>
            </div>
          )
        )}
      </div>

      {/* LOS MESES YA CERRADOS */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100">
          <h3 className="text-sm font-black text-gray-900">Meses cerrados</h3>
        </div>
        {(lista?.periodos ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">
            Todavía no se ha cerrado ningún mes. Mientras no se cierre, cualquier asiento con fecha
            vieja cambia los informes de meses pasados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Mes</th>
                <th className="text-right px-3 py-2 font-bold">Ingresos</th>
                <th className="text-right px-3 py-2 font-bold">Gastos</th>
                <th className="text-right px-3 py-2 font-bold">Resultado</th>
                <th className="text-left px-3 py-2 font-bold">Cerrado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.periodos.map((p: any) => (
                <tr key={p.periodo} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs font-bold text-gray-800">{p.periodo}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{crc(p.ingresos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{crc(p.gastos)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${
                    Number(p.utilidad) < 0 ? 'text-red-600' : 'text-gray-900'}`}>{crc(p.utilidad)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {String(p.cerrado_at ?? '').slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => void reabrir(p.periodo)}
                      className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 ml-auto">
                      <Unlock size={12} /> Reabrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-gray-400 leading-snug">
        El estado de resultados de un mes cerrado sigue dando lo mismo que antes de cerrarlo: el
        informe deja fuera los asientos de cierre a propósito, para que lo que se declaró se pueda
        volver a sacar igual. En el balance de comprobación sí aparecen, porque ahí lo que se prueba
        es que todos los asientos cuadran.
      </p>
    </div>
  );
};

export default CierrePeriodo;
