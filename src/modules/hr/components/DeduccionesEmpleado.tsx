'use client';

import React from 'react';
import { X, Loader2, Plus, Trash2, Power, Info } from 'lucide-react';
import { deduccionesService } from '@/services/hr/hrService';
import { TIPOS_DEDUCCION, type DeduccionEmpleado, type TipoDeduccion } from '../types/HR.types';

/**
 * LAS DEDUCCIONES FIJAS DE UN EMPLEADO.
 *
 * ── El hueco que esto cierra ─────────────────────────────────────────────
 * La planilla tenía las columnas `advances` y `other_deductions` desde el
 * principio, y SIEMPRE valían cero porque no había dónde anotar nada. Así que
 * el neto que mostraba el sistema no era el que la persona recibía: faltaba
 * el préstamo, la asociación solidarista, la pensión alimentaria. El número
 * se veía prolijo y era mentira.
 *
 * ── Un préstamo se apaga solo ────────────────────────────────────────────
 * Lleva el monto total y el saldo. La última cuota es lo que falta —no la
 * cuota llena— y al llegar a cero la deducción se apaga. Sin eso, un préstamo
 * de ₡200.000 en cuotas de ₡25.000 seguiría rebajando el mes nueve y el diez,
 * y nadie lo nota hasta que el empleado reclama.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

export const DeduccionesEmpleado: React.FC<{
  employeeId: string;
  employeeName: string;
  onCerrar: () => void;
}> = ({ employeeId, employeeName, onCerrar }) => {
  const [lista, setLista] = React.useState<DeduccionEmpleado[]>([]);
  const [sinTabla, setSinTabla] = React.useState(false);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState('');
  const [nueva, setNueva] = React.useState(false);

  const cargar = React.useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await deduccionesService.list(employeeId);
      setSinTabla(r.sin_tabla === true);
      setLista(r.deducciones ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar'); }
    finally { setCargando(false); }
  }, [employeeId]);
  React.useEffect(() => { void cargar(); }, [cargar]);

  const apagarPrender = async (d: DeduccionEmpleado) => {
    setError('');
    try { await deduccionesService.update(d.id, { activo: !d.activo }); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar'); }
  };

  const borrar = async (d: DeduccionEmpleado) => {
    if (!confirm(`¿Quitar «${d.label}»?\n\n`
      + 'Deja de rebajarse de la próxima planilla. Lo que ya se le rebajó en meses anteriores no '
      + 'cambia: quedó congelado en la planilla de cada mes.')) return;
    setError('');
    try { await deduccionesService.remove(d.id); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar'); }
  };

  const activas = lista.filter(d => d.activo);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onCerrar}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Deducciones de {employeeName}</h2>
            <p className="text-xs text-gray-500">
              Préstamos, asociación solidarista, cooperativa, pensión alimentaria, embargos.
              Se rebajan en cada planilla, después de las cargas y el impuesto.
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-3">
          {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          {sinTabla ? (
            <p className="text-sm text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
              Falta correr la migración <b>149_planilla_deducciones.sql</b>. Crea la tabla de las
              deducciones y las columnas del desglose de la planilla.
            </p>
          ) : cargando ? (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
          ) : (
            <>
              {lista.length === 0 && !nueva && (
                <div className="text-center py-6">
                  <p className="text-sm font-bold text-gray-700">No tiene deducciones fijas</p>
                  <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                    Acá van las cosas que se le rebajan todos los meses además de la CCSS y el
                    impuesto. Los adelantos de un mes puntual se ponen en la planilla, no acá.
                  </p>
                </div>
              )}

              {lista.map(d => (
                <div key={d.id} className={`border rounded-xl p-3 ${d.activo ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                        {d.label}
                        <span className="text-[9px] font-black uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {TIPOS_DEDUCCION.find(t => t.id === d.tipo)?.label ?? d.tipo}
                        </span>
                        {!d.activo && (
                          <span className="text-[9px] font-black uppercase bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            apagada
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-600">
                        {d.modo === 'porcentaje'
                          ? `${d.pct}% del salario bruto${d.tope ? ` · tope ${crc(d.tope)}` : ''}`
                          : `${crc(d.monto)} por planilla`}
                        {d.desde && ` · desde ${String(d.desde).slice(0, 10)}`}
                        {d.hasta && ` · hasta ${String(d.hasta).slice(0, 10)}`}
                      </p>
                      {d.saldo_restante != null && (
                        <>
                          <p className="text-xs font-bold text-indigo-700 mt-1">
                            Saldo: {crc(d.saldo_restante)}
                            {d.saldo_total != null && <span className="text-gray-400 font-normal"> de {crc(d.saldo_total)}</span>}
                          </p>
                          {d.saldo_total ? (
                            <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden max-w-xs">
                              <div className="bg-indigo-500 h-full" style={{
                                width: `${Math.min(100, Math.max(0,
                                  (1 - Number(d.saldo_restante) / Number(d.saldo_total)) * 100))}%`,
                              }} />
                            </div>
                          ) : null}
                        </>
                      )}
                      {d.notas && <p className="text-[11px] text-gray-400 mt-1">{d.notas}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => void apagarPrender(d)}
                        title={d.activo ? 'Apagar (deja de rebajarse)' : 'Volver a aplicar'}
                        className={d.activo ? 'text-gray-300 hover:text-amber-600' : 'text-amber-600'}>
                        <Power size={14} />
                      </button>
                      <button onClick={() => void borrar(d)} title="Quitar"
                        className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}

              {nueva ? (
                <Formulario employeeId={employeeId} onCerrar={() => setNueva(false)}
                  onListo={() => { setNueva(false); void cargar(); }} />
              ) : (
                <button onClick={() => setNueva(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">
                  <Plus size={13} /> Agregar deducción
                </button>
              )}

              {activas.length > 0 && (
                <p className="text-[11px] text-gray-400 leading-snug border-t border-gray-100 pt-2">
                  La planilla avisa si los descuentos que no son pensión alimentaria se llevan más de la
                  mitad de lo que queda después de cargas e impuesto. No los topa sola: el límite legal
                  depende del tipo de deuda y de resoluciones que el sistema no conoce, y rebajar de
                  menos haría incumplir una orden judicial.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Formulario: React.FC<{
  employeeId: string; onCerrar: () => void; onListo: () => void;
}> = ({ employeeId, onCerrar, onListo }) => {
  const [f, setF] = React.useState({
    tipo: 'prestamo' as TipoDeduccion,
    label: 'Préstamo',
    modo: 'fijo' as 'fijo' | 'porcentaje',
    monto: '', pct: '', tope: '', saldo_total: '',
    desde: hoyCR(), hasta: '', notas: '',
  });
  const [error, setError] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);

  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));

  const cambiarTipo = (tipo: TipoDeduccion) => {
    const t = TIPOS_DEDUCCION.find(x => x.id === tipo);
    setF(x => ({
      ...x, tipo,
      /* El nombre se mueve con el tipo mientras no lo hayan escrito a mano:
         así no queda «Préstamo» encabezando un embargo. */
      label: TIPOS_DEDUCCION.some(y => y.label === x.label) ? (t?.label ?? x.label) : x.label,
      // Las de porcentaje suelen ser el solidarista y la cooperativa.
      modo: tipo === 'solidarista' || tipo === 'cooperativa' ? 'porcentaje' : 'fijo',
    }));
  };

  const esPrestamo = f.tipo === 'prestamo';
  const nota = TIPOS_DEDUCCION.find(t => t.id === f.tipo)?.nota;

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      await deduccionesService.create(employeeId, {
        tipo: f.tipo, label: f.label.trim(), modo: f.modo,
        monto: f.modo === 'fijo' ? Number(f.monto) || 0 : 0,
        pct: f.modo === 'porcentaje' ? Number(f.pct) || 0 : 0,
        tope: f.tope ? Number(f.tope) : null,
        saldo_total: f.saldo_total ? Number(f.saldo_total) : null,
        desde: f.desde || null, hasta: f.hasta || null,
        notas: f.notas.trim() || null,
      });
      onListo();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const puede = f.label.trim()
    && (f.modo === 'fijo' ? Number(f.monto) > 0 : Number(f.pct) > 0)
    && (!esPrestamo || Number(f.saldo_total) > 0);

  /** Cuántas planillas va a tardar en saldarse. Ayuda a confirmar la cuota. */
  const cuotas = esPrestamo && Number(f.monto) > 0 && Number(f.saldo_total) > 0
    ? Math.ceil(Number(f.saldo_total) / Number(f.monto)) : 0;

  return (
    <div className="border-2 border-indigo-200 rounded-xl p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Tipo</label>
          <select value={f.tipo} onChange={e => cambiarTipo(e.target.value as TipoDeduccion)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
            {TIPOS_DEDUCCION.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Cómo aparece en el comprobante</label>
          <input value={f.label} onChange={e => set('label', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {nota && (
        <p className="text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1.5 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" /> {nota}
        </p>
      )}

      <div className="flex gap-3 flex-wrap">
        {(['fijo', 'porcentaje'] as const).map(m => (
          <label key={m} className="flex items-center gap-1.5 text-sm text-gray-800">
            <input type="radio" name="modo" checked={f.modo === m} onChange={() => set('modo', m)} />
            {m === 'fijo' ? 'Monto fijo' : '% del bruto'}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {f.modo === 'fijo' ? (
          <div>
            <label className="block text-[11px] font-bold text-gray-500">
              {esPrestamo ? 'Cuota por planilla' : 'Monto por planilla'}
            </label>
            <input type="number" inputMode="decimal" value={f.monto} onChange={e => set('monto', e.target.value)}
              placeholder="25000" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-[11px] font-bold text-gray-500">Porcentaje del bruto</label>
              <input type="number" step="0.01" value={f.pct} onChange={e => set('pct', e.target.value)}
                placeholder="5" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500">Tope mensual (opcional)</label>
              <input type="number" value={f.tope} onChange={e => set('tope', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </>
        )}
        {esPrestamo && (
          <div>
            <label className="block text-[11px] font-bold text-gray-500">Monto total del préstamo</label>
            <input type="number" inputMode="decimal" value={f.saldo_total}
              onChange={e => set('saldo_total', e.target.value)}
              placeholder="200000" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
              Es lo que hace que la deducción se apague sola al saldarse.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Desde</label>
          <input type="date" value={f.desde} onChange={e => set('desde', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Hasta (opcional)</label>
          <input type="date" value={f.hasta} onChange={e => set('hasta', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500">Notas</label>
          <input value={f.notas} onChange={e => set('notas', e.target.value)}
            placeholder="N.º de expediente, acuerdo…"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {cuotas > 0 && (
        <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          Se salda en <b>{cuotas} planilla(s)</b>. La última va a ser de {crc(
            Number(f.saldo_total) - Number(f.monto) * (cuotas - 1))}, no de la cuota llena.
        </p>
      )}
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button onClick={() => void guardar()} disabled={!puede || guardando}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
          {guardando && <Loader2 size={13} className="animate-spin" />} Guardar
        </button>
        <button onClick={onCerrar} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600">
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default DeduccionesEmpleado;
