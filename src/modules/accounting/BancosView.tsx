'use client';

import React, { useEffect, useState } from 'react';
import {
  Landmark, Plus, Loader2, CreditCard, ArrowDownToLine, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * BANCOS: cuentas, depósitos, liquidación de tarjetas y conciliación.
 *
 * Todo lo que mueve plata entre cuentas sin que haya una venta de por medio.
 * Son los movimientos que nadie registra porque «no son una operación», y son
 * justamente los que hacen que el saldo contable y el del banco dejen de
 * parecerse.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

/** Los métodos de cobro que pueden caer en un banco. */
const METODOS = [
  { id: 'sinpe', nombre: 'SINPE' },
  { id: 'transfer', nombre: 'Transferencia' },
  { id: 'deposito', nombre: 'Depósito' },
];

export const BancosView: React.FC = () => {
  const [cuentas, setCuentas] = useState<any[] | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [porLiquidar, setPorLiquidar] = useState<any>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [nueva, setNueva] = useState({ nombre: '', banco: '', numero: '' });
  const [concil, setConcil] = useState<any>(null);
  const [concilCode, setConcilCode] = useState('');
  const [marcadas, setMarcadas] = useState<string[]>([]);

  const cargar = async () => {
    try {
      const r = await apiFetch<any>('/accounting/bancos', {}, 60000);
      if (r.sin_tabla) { setSinTabla(true); setCuentas([]); return; }
      setCuentas(r.cuentas ?? []);
      setPorLiquidar(await apiFetch<any>('/accounting/bancos/por-liquidar', {}, 30000));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
  };
  useEffect(() => { void cargar(); }, []);

  const crear = async () => {
    setError(''); setAviso('');
    try {
      await apiFetch('/accounting/bancos', { method: 'POST', body: JSON.stringify(nueva) });
      setNueva({ nombre: '', banco: '', numero: '' });
      setAviso('Cuenta creada, con su cuenta contable propia.');
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear'); }
  };

  const cambiarMetodos = async (cta: any, metodo: string) => {
    const actuales: string[] = cta.metodos ?? [];
    const nuevos = actuales.includes(metodo)
      ? actuales.filter(m => m !== metodo) : [...actuales, metodo];
    try {
      await apiFetch(`/accounting/bancos/${cta.id}`, {
        method: 'PUT', body: JSON.stringify({ metodos: nuevos }),
      });
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  const depositar = async (cta: any) => {
    const m = prompt(`¿Cuánto efectivo se depositó en «${cta.nombre}»?`);
    if (m === null) return;
    const monto = Number(String(m).replace(/[^\d.]/g, ''));
    if (!(monto > 0)) { setError('Escribí un monto mayor que cero.'); return; }
    try {
      const r = await apiFetch<any>('/accounting/bancos/deposito', {
        method: 'POST',
        body: JSON.stringify({ bank_account_id: cta.id, monto, fecha: hoyCR() }),
      });
      setAviso(`Depósito registrado con el asiento #${r.numero}: sale de Caja y entra a ${cta.nombre}.`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar'); }
  };

  const liquidar = async () => {
    const br = prompt('¿Cuánto suma el BRUTO de las ventas que te liquidaron?');
    if (br === null) return;
    const ne = prompt('¿Cuánto te depositó el procesador (el NETO)?');
    if (ne === null) return;
    const bruto = Number(String(br).replace(/[^\d.]/g, ''));
    const neto = Number(String(ne).replace(/[^\d.]/g, ''));
    if (!(bruto > 0) || !(neto >= 0)) { setError('Los montos tienen que ser números.'); return; }
    const cta = (cuentas ?? [])[0];
    try {
      const r = await apiFetch<any>('/accounting/bancos/liquidacion', {
        method: 'POST',
        body: JSON.stringify({ bruto, neto, bank_account_id: cta?.id, fecha: hoyCR() }),
      });
      setAviso(`Liquidación registrada: ${crc(r.neto)} al banco y ${crc(r.comision)} a comisiones `
        + `(asiento #${r.numero}).`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar'); }
  };

  const abrirConciliacion = async (cta: any) => {
    setConcilCode(cta.code); setConcil(null); setMarcadas([]);
    try { setConcil(await apiFetch<any>(`/accounting/conciliacion/${cta.code}`, {}, 60000)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir'); }
  };

  const guardarConciliacion = async () => {
    if (marcadas.length === 0) return;
    try {
      await apiFetch('/accounting/conciliacion', {
        method: 'POST', body: JSON.stringify({ ids: marcadas, conciliado: true }),
      });
      setAviso(`${marcadas.length} partida(s) marcadas como conciliadas.`);
      setMarcadas([]);
      setConcil(await apiFetch<any>(`/accounting/conciliacion/${concilCode}`, {}, 60000));
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  if (sinTabla) {
    return (
      <p className="text-sm text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
        Falta correr la migración <b>123_bancos.sql</b>. Crea las cuentas bancarias, las
        liquidaciones de tarjeta y la conciliación.
      </p>
    );
  }
  if (cuentas === null) {
    return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>;
  }

  return (
    <div className="space-y-4">
      {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {/* TARJETAS POR LIQUIDAR: el dinero que el procesador todavía no depositó.
          Va arriba porque es el saldo que nadie sabía que existía. */}
      {porLiquidar && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <CreditCard size={20} className="text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-black text-gray-900">
                Tarjetas por liquidar: {crc(porLiquidar.saldo)}
              </p>
              <p className="text-[11px] text-gray-500 leading-snug max-w-xl">
                Ventas con tarjeta que el procesador todavía no depositó. No es banco todavía:
                llega días después y neto de comisión. Al registrar el depósito, esta cuenta baja
                y la comisión queda como gasto.
              </p>
            </div>
          </div>
          <button onClick={() => void liquidar()}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shrink-0">
            Registrar un depósito del procesador
          </button>
        </div>
      )}

      {/* CUENTAS BANCARIAS */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
          <Landmark size={15} className="text-gray-400" /> Cuentas bancarias
        </h3>
        {cuentas.length === 0 && (
          <p className="text-xs text-gray-500">
            Sin cuentas creadas, todo lo bancario cae en una sola cuenta contable y la
            conciliación no se puede hacer: no hay contra qué comparar un estado de cuenta.
          </p>
        )}

        {cuentas.map(cta => (
          <div key={cta.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-gray-900 text-sm">
                  {cta.nombre}
                  <span className="ml-2 font-mono text-[10px] text-gray-400">{cta.code}</span>
                </p>
                <p className="text-[11px] text-gray-500">
                  {[cta.banco, cta.numero, cta.moneda].filter(Boolean).join(' · ') || 'sin detalles'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black tabular-nums text-gray-900">{crc(cta.saldo)}</p>
                <p className="text-[11px] text-gray-500">
                  {cta.movimientos} movimiento(s)
                  {cta.sin_conciliar > 0 && (
                    <span className="text-amber-700 font-bold"> · {cta.sin_conciliar} sin conciliar</span>
                  )}
                </p>
              </div>
            </div>

            {/* A qué métodos de cobro atiende. Sin esto el sistema no sabe
                a cuál banco entra un SINPE. */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500">Recibe:</span>
              {METODOS.map(m => {
                const on = (cta.metodos ?? []).includes(m.id);
                return (
                  <button key={m.id} onClick={() => void cambiarMetodos(cta, m.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                      on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {m.nombre}
                  </button>
                );
              })}
              <span className="flex-1" />
              <button onClick={() => void depositar(cta)}
                className="flex items-center gap-1 text-[11px] font-bold text-gray-600 hover:text-gray-900">
                <ArrowDownToLine size={12} /> Depositar efectivo
              </button>
              <button onClick={() => void abrirConciliacion(cta)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">
                Conciliar
              </button>
            </div>
          </div>
        ))}

        <div className="flex gap-2 items-end flex-wrap pt-2 border-t border-gray-100">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] font-bold text-gray-500">Nombre</label>
            <input value={nueva.nombre} onChange={e => setNueva(n => ({ ...n, nombre: e.target.value }))}
              placeholder="BAC corriente" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500">Banco</label>
            <input value={nueva.banco} onChange={e => setNueva(n => ({ ...n, banco: e.target.value }))}
              placeholder="BAC" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-28" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500">Últimos dígitos</label>
            <input value={nueva.numero} onChange={e => setNueva(n => ({ ...n, numero: e.target.value }))}
              placeholder="4821" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24" />
          </div>
          <button onClick={() => void crear()} disabled={!nueva.nombre.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold disabled:bg-gray-300">
            <Plus size={13} /> Agregar cuenta
          </button>
        </div>
      </div>

      {/* CONCILIACIÓN */}
      {concil && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-black text-gray-900">Conciliación · {concilCode}</h3>
              {/* Los dos saldos, juntos: es lo que convierte «no cuadra» en
                  «faltan estas tres partidas». */}
              <p className="text-[11px] text-gray-500">
                Contable {crc(concil.saldo_contable)} · conciliado {crc(concil.saldo_conciliado)}
                {concil.sin_conciliar > 0 && (
                  <span className="text-amber-700 font-bold"> · {concil.sin_conciliar} sin marcar</span>
                )}
              </p>
            </div>
            <button onClick={() => void guardarConciliacion()} disabled={marcadas.length === 0}
              className="px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold disabled:bg-gray-300">
              Marcar {marcadas.length} como conciliadas
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {concil.movimientos.map((m: any) => (
                  <tr key={m.id} className={m.conciliado ? 'bg-emerald-50/40' : ''}>
                    <td className="px-3 py-1.5 w-8">
                      {m.conciliado ? (
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      ) : (
                        <input type="checkbox" checked={marcadas.includes(m.id)}
                          onChange={() => setMarcadas(x => x.includes(m.id)
                            ? x.filter(y => y !== m.id) : [...x, m.id])} />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-500 w-24">{m.fecha}</td>
                    <td className="px-2 py-1.5 text-gray-700 text-xs">#{m.numero} {m.descripcion}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs">{m.debe ? crc(m.debe) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-500">{m.haber ? crc(m.haber) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {concil.movimientos.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-500">Sin movimientos en esta cuenta.</p>
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
        El saldo conciliado es el que debería coincidir con tu estado de cuenta. Si no coincide,
        la diferencia está en las partidas sin marcar.
      </p>
    </div>
  );
};

export default BancosView;
