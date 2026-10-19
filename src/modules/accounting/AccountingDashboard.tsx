'use client';

import React, { useEffect, useState } from 'react';
import {
  BookOpen, Loader2, RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle2,
  Scale, TrendingUp, Building2, List, Landmark,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { BancosView } from './BancosView';

/**
 * CONTABILIDAD.
 *
 * Catálogo de cuentas, libro diario, mayor, balance de comprobación, estado
 * de resultados y balance general, con asientos automáticos desde las
 * ventas, los gastos y las compras.
 *
 * ── Lo que esta pantalla no esconde ──────────────────────────────────────
 * Cuando el balance no cuadra, lo dice con la diferencia exacta. Cuando hay
 * ventas sin costo registrado, lo dice con el número. Un informe contable que
 * se ve prolijo y está mal es peor que uno que avisa: el prolijo se presenta,
 * y el error aparece meses después.
 */

type Vista = 'resumen' | 'diario' | 'bancos' | 'cuentas' | 'mayor';

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const primeroDelMes = () => hoyCR().slice(0, 8) + '01';

export const AccountingDashboard: React.FC = () => {
  const [vista, setVista] = useState<Vista>('resumen');
  const [desde, setDesde] = useState(primeroDelMes());
  const [hasta, setHasta] = useState(hoyCR());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [sinTabla, setSinTabla] = useState(false);

  const [balance, setBalance] = useState<any>(null);
  const [resultados, setResultados] = useState<any>(null);
  const [situacion, setSituacion] = useState<any>(null);
  const [diario, setDiario] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [mayorCode, setMayorCode] = useState('');
  const [mayor, setMayor] = useState<any>(null);
  const [contabilizando, setContabilizando] = useState(false);

  const rango = `desde=${desde}&hasta=${hasta}`;

  const cargar = async () => {
    setCargando(true); setError('');
    try {
      const cu = await apiFetch<any>('/accounting/cuentas', {}, 30000);
      if (cu.sin_tabla) { setSinTabla(true); setCargando(false); return; }
      setSinTabla(false);
      setCuentas(cu.cuentas ?? []);
      const [b, r, s, d] = await Promise.all([
        apiFetch<any>(`/accounting/balance?${rango}`, {}, 60000),
        apiFetch<any>(`/accounting/resultados?${rango}`, {}, 60000),
        apiFetch<any>(`/accounting/situacion?hasta=${hasta}`, {}, 60000),
        apiFetch<any>(`/accounting/diario?${rango}`, {}, 60000),
      ]);
      setBalance(b); setResultados(r); setSituacion(s); setDiario(d.asientos ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  };
  useEffect(() => { void cargar(); /* eslint-disable-next-line */ }, [desde, hasta]);

  const contabilizar = async () => {
    setContabilizando(true); setError(''); setAviso('');
    try {
      const r = await apiFetch<any>('/accounting/contabilizar', {
        method: 'POST', body: JSON.stringify({ desde, hasta }),
      }, 60000);
      setAviso(`Contabilizado: ${r.ventas} venta(s), ${r.gastos} gasto(s), ${r.compras} compra(s).`
        + (r.saltados ? ` ${r.saltados} ya tenían asiento.` : '')
        + (r.faltan ? ` Quedan ${r.faltan} para la próxima corrida: tocá otra vez.` : ''));
      if (r.errores?.length) setError(`Algunos no se pudieron: ${r.errores.slice(0, 3).join(' · ')}`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo contabilizar'); }
    finally { setContabilizando(false); }
  };

  const verMayor = async (code: string) => {
    setMayorCode(code); setVista('mayor'); setMayor(null);
    try { setMayor(await apiFetch<any>(`/accounting/mayor/${code}?${rango}`, {}, 60000)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el mayor'); }
  };

  const anular = async (a: any) => {
    if (!confirm(`¿Anular el asiento #${a.numero}?\n\nNo se borra: se hace un contra-asiento, `
      + 'que es lo que permite explicar después por qué cambió el balance.')) return;
    try {
      await apiFetch(`/accounting/diario/${a.id}/anular`, { method: 'POST' });
      setAviso(`Asiento #${a.numero} anulado con un contra-asiento.`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo anular'); }
  };

  if (sinTabla) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-xl font-black text-gray-900 mb-2">Contabilidad</h1>
        <p className="text-sm text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
          Falta correr la migración <b>122_contabilidad.sql</b>. Crea el catálogo de cuentas y el
          libro diario, y además agrega los campos que faltaban para poder contabilizar:
          el impuesto en gastos y compras, y el costo en cada salida de inventario.
        </p>
      </div>
    );
  }

  const Tarjeta: React.FC<{ titulo: string; valor: string; nota?: string; color?: string }> =
    ({ titulo, valor, nota, color }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs font-bold text-gray-500">{titulo}</p>
      <p className={`text-2xl font-black tabular-nums ${color ?? 'text-gray-900'}`}>{valor}</p>
      {nota && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{nota}</p>}
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-600" /> Contabilidad
          </h1>
          <p className="text-sm text-gray-500">Partida doble, con asientos automáticos desde tu operación.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[11px] font-bold text-gray-500">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <button onClick={() => void contabilizar()} disabled={contabilizando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
            {contabilizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Contabilizar pendientes
          </button>
        </div>
      </div>

      {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {([['resumen', 'Informes', Scale], ['diario', 'Libro diario', List],
           ['bancos', 'Bancos', Landmark],
           ['cuentas', 'Catálogo', Building2], ['mayor', 'Mayor', TrendingUp]] as const).map(([id, t, Ico]) => (
          <button key={id} onClick={() => setVista(id as Vista)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold border-b-2 -mb-px ${
              vista === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'}`}>
            <Ico size={14} /> {t}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Calculando…
        </p>
      ) : vista === 'resumen' ? (
        <div className="space-y-4">
          {/* LO PRIMERO: ¿cuadra? Si no, todo lo demás hay que mirarlo con pinzas. */}
          {balance && (
            <div className={`rounded-xl p-4 border-2 flex items-start gap-3 ${
              balance.cuadra ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-300'}`}>
              {balance.cuadra
                ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                : <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />}
              <div>
                <p className="font-black text-gray-900">
                  {balance.cuadra ? 'El balance cuadra' : `El balance NO cuadra: diferencia de ${crc(balance.diferencia)}`}
                </p>
                <p className="text-sm text-gray-700">
                  Debe {crc(balance.total_debe)} · Haber {crc(balance.total_haber)}
                  {!balance.cuadra && ' — revisá el libro diario: algún asiento se cargó mal.'}
                </p>
              </div>
            </div>
          )}

          {resultados && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Tarjeta titulo="Ingresos" valor={crc(resultados.total_ingresos)} color="text-emerald-700" />
                <Tarjeta titulo="Costo de ventas" valor={crc(resultados.costo_de_ventas)} />
                <Tarjeta titulo="Gastos" valor={crc(resultados.gastos_operativos)} />
                <Tarjeta titulo="Utilidad neta" valor={crc(resultados.utilidad_neta)}
                  color={resultados.utilidad_neta >= 0 ? 'text-emerald-700' : 'text-red-600'} />
              </div>
              {/* El hueco declarado: sin esto, costo cero se lee como margen del 100%. */}
              {resultados.ventas_sin_costo > 0 && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <b>{resultados.ventas_sin_costo} venta(s) sin costo registrado.</b> Su costo no entra
                  en este estado de resultados, así que la utilidad se ve más alta de lo que es. El costo
                  se empieza a guardar en cada salida de inventario desde la migración 122: las ventas
                  anteriores a eso no lo tienen.
                </p>
              )}
            </>
          )}

          {situacion && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {([['Activo', situacion.activo, situacion.total_activo],
                 ['Pasivo', situacion.pasivo, situacion.total_pasivo],
                 ['Patrimonio', situacion.patrimonio, situacion.total_patrimonio]] as const).map(([t, filas, total]) => (
                <div key={t} className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-black text-gray-900 mb-2">{t}</h3>
                  {(filas as any[]).map((f: any) => (
                    <button key={f.code} onClick={() => void verMayor(f.code)}
                      className="w-full flex justify-between text-xs py-1 border-b border-gray-50 hover:bg-gray-50">
                      <span className="text-gray-600 truncate">{f.code} {f.name}</span>
                      <span className="tabular-nums font-semibold text-gray-800">{crc(f.saldo)}</span>
                    </button>
                  ))}
                  {t === 'Patrimonio' && (
                    <div className="flex justify-between text-xs py-1 text-gray-500">
                      <span>Resultado del período</span>
                      <span className="tabular-nums">{crc(situacion.resultado_del_periodo)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black pt-2 mt-1 border-t border-gray-200">
                    <span>Total</span><span className="tabular-nums">{crc(total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {situacion && !situacion.cuadra && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <b>La ecuación contable no cierra por {crc(situacion.diferencia)}.</b> Activo debería ser
              igual a pasivo más patrimonio.
            </p>
          )}

          {balance && balance.cuentas.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100">
                <h3 className="text-sm font-black text-gray-900">Balance de comprobación</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold">Cuenta</th>
                    <th className="text-right px-3 py-2 font-bold">Debe</th>
                    <th className="text-right px-3 py-2 font-bold">Haber</th>
                    <th className="text-right px-3 py-2 font-bold">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {balance.cuentas.map((f: any) => (
                    <tr key={f.code} className="hover:bg-gray-50 cursor-pointer" onClick={() => void verMayor(f.code)}>
                      <td className="px-4 py-1.5"><span className="font-mono text-xs text-gray-400">{f.code}</span> {f.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{f.debe ? crc(f.debe) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{f.haber ? crc(f.haber) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold">{crc(f.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-black">
                  <tr>
                    <td className="px-4 py-2">Totales</td>
                    <td className="px-3 py-2 text-right tabular-nums">{crc(balance.total_debe)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{crc(balance.total_haber)}</td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : vista === 'diario' ? (
        <div className="space-y-2">
          {diario.length === 0 && (
            <p className="text-sm text-gray-500">
              No hay asientos en este período. Tocá «Contabilizar pendientes» para generarlos
              desde tus ventas, gastos y compras.
            </p>
          )}
          {diario.map(a => (
            <div key={a.id} className={`bg-white border rounded-xl p-3 ${a.anulado ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-sm font-bold text-gray-900">
                  #{a.numero} · {a.fecha}
                  {a.anulado && <span className="ml-2 text-[10px] font-black uppercase bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">anulado</span>}
                  {a.source_type && <span className="ml-2 text-[10px] text-gray-400">{a.source_type}</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold tabular-nums text-gray-700">{crc(a.total)}</span>
                  {!a.anulado && (
                    <button onClick={() => void anular(a)} title="Anular con contra-asiento"
                      className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                  )}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-1.5">{a.descripcion}</p>
              <table className="w-full text-xs">
                <tbody>
                  {a.lineas.map((l: any) => (
                    <tr key={l.id} className="border-t border-gray-50">
                      <td className="py-0.5 text-gray-500 font-mono w-14">{l.code}</td>
                      <td className="py-0.5 text-gray-700">{l.detalle}</td>
                      <td className="py-0.5 text-right tabular-nums w-24">{Number(l.debe) ? crc(l.debe) : ''}</td>
                      <td className="py-0.5 text-right tabular-nums w-24 text-gray-500">{Number(l.haber) ? crc(l.haber) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : vista === 'bancos' ? (
        <BancosView />
      ) : vista === 'cuentas' ? (
        <CatalogoCuentas cuentas={cuentas} onCambio={cargar} onMayor={verMayor} />
      ) : (
        <div className="space-y-2">
          {!mayorCode && <p className="text-sm text-gray-500">Elegí una cuenta desde los informes o el catálogo.</p>}
          {mayorCode && !mayor && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>}
          {mayor && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex justify-between">
                <h3 className="text-sm font-black text-gray-900">
                  {mayor.cuenta.code} · {mayor.cuenta.name}
                </h3>
                <span className="text-sm font-black tabular-nums">{crc(mayor.saldo_final)}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold">Fecha</th>
                    <th className="text-left px-3 py-2 font-bold">Detalle</th>
                    <th className="text-right px-3 py-2 font-bold">Debe</th>
                    <th className="text-right px-3 py-2 font-bold">Haber</th>
                    <th className="text-right px-4 py-2 font-bold">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mayor.movimientos.map((m: any, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-1.5 text-gray-600">{m.fecha}</td>
                      <td className="px-3 py-1.5 text-gray-700">#{m.numero} {m.descripcion}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.debe ? crc(m.debe) : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{m.haber ? crc(m.haber) : ''}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-bold">{crc(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mayor.movimientos.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">Sin movimientos en este período.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** El catálogo, con alta de cuentas nuevas. */
const CatalogoCuentas: React.FC<{ cuentas: any[]; onCambio: () => void; onMayor: (c: string) => void }> =
  ({ cuentas, onCambio, onMayor }) => {
  const [nueva, setNueva] = useState({ code: '', name: '', type: 'gasto' });
  const [error, setError] = useState('');

  const crear = async () => {
    setError('');
    try {
      await apiFetch('/accounting/cuentas', { method: 'POST', body: JSON.stringify(nueva) });
      setNueva({ code: '', name: '', type: 'gasto' });
      onCambio();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear'); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-2 flex-wrap items-end">
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Código</label>
          <input value={nueva.code} onChange={e => setNueva(n => ({ ...n, code: e.target.value }))}
            placeholder="5206" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-bold text-gray-500">Nombre</label>
          <input value={nueva.name} onChange={e => setNueva(n => ({ ...n, name: e.target.value }))}
            placeholder="Publicidad" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Tipo</label>
          <select value={nueva.type} onChange={e => setNueva(n => ({ ...n, type: e.target.value }))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
            {['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={() => void crear()} disabled={!nueva.code || !nueva.name}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold disabled:bg-gray-300">
          <Plus size={13} /> Agregar
        </button>
        {error && <p className="text-xs text-red-600 font-semibold w-full">{error}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50">
            {cuentas.map(cu => (
              <tr key={cu.code} className={cu.postable ? 'hover:bg-gray-50' : 'bg-gray-50/60'}>
                <td className="px-4 py-1.5 font-mono text-xs text-gray-400 w-20">{cu.code}</td>
                <td className={`px-3 py-1.5 ${cu.postable ? 'text-gray-800' : 'font-black text-gray-900'}`}>
                  {cu.name}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-400">{cu.type}</td>
                <td className="px-4 py-1.5 text-right">
                  {cu.postable && (
                    <button onClick={() => onMayor(cu.code)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800">ver mayor</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountingDashboard;
