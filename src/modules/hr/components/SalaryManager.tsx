'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DollarSign, Download, Users, TrendingUp, FileText, Loader2, Save, CheckCircle2,
  AlertCircle, Banknote, History, Trash2, RefreshCw, Receipt,
} from 'lucide-react';
import { payrollService, type PlanillaPreview } from '@/services/hr/hrService';
import { downloadCsv } from '@/utils/csv';
import type { PayrollItem, PayrollRun } from '../types/HR.types';

const fmt = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

/** Primer y último día del mes que contiene la fecha dada. */
const mesDe = (d = new Date()) => ({
  from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10),
  to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10),
});

const dia = (s?: string | null) =>
  s ? new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CR') : '—';

/**
 * PLANILLA.
 *
 * Antes esta pantalla era una calculadora: multiplicaba el salario del
 * expediente y mostraba el resultado. Al salir no quedaba nada, así que no se
 * podía saber cuánto se pagó el mes pasado ni reimprimir la planilla; y si
 * alguien le subía el salario a un empleado, los meses anteriores «cambiaban»
 * hacia atrás. Además la comisión se calculaba sobre el propio salario, así que
 * un vendedor que no vendía nada igual la generaba.
 *
 * Ahora la planilla se arma con lo que el sistema ya sabe —las horas de los
 * marcajes, las ventas que cada uno facturó, las ausencias sin goce—, se GUARDA
 * con los montos congelados, y al pagarla queda registrada como gasto para que
 * aparezca en la utilidad del negocio.
 */
export const SalaryManager: React.FC = () => {
  const [{ from, to }, setPeriodo] = useState(mesDe());
  const [prev, setPrev] = useState<PlanillaPreview | null>(null);
  const [lineas, setLineas] = useState<PayrollItem[]>([]);
  const [historial, setHistorial] = useState<PayrollRun[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setMsg(null);
    try {
      const p = await payrollService.preview(from, to);
      setPrev(p);
      setLineas(p.lineas);
    } catch (e) {
      setPrev(null); setLineas([]);
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo calcular la planilla' });
    } finally { setCargando(false); }
  }, [from, to]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cargarHistorial = useCallback(async () => {
    try { setHistorial(await payrollService.list()); } catch { /* sin historial */ }
  }, []);
  useEffect(() => { void cargarHistorial(); }, [cargarHistorial]);

  const cargas = prev?.cargas ?? { obrero: 0.1067, patronal: 0.2667 };

  /**
   * Los totales se recalculan en pantalla con lo que el usuario ajustó.
   *
   * El backend los vuelve a calcular al guardar: lo que se ve acá es para decidir,
   * no es la fuente de la verdad.
   */
  const totales = useMemo(() => {
    const bruto = lineas.reduce((t, l) => t + l.base_amount + l.commission_amount + (l.bonuses ?? 0), 0);
    const obrero = bruto * cargas.obrero;
    const descuentos = lineas.reduce((t, l) => t + (l.advances ?? 0) + (l.other_deductions ?? 0), 0);
    const patronal = bruto * cargas.patronal;
    return {
      bruto, obrero, descuentos, patronal,
      neto: bruto - obrero - descuentos,
      costo: bruto + patronal,
      comisiones: lineas.reduce((t, l) => t + l.commission_amount, 0),
      base: lineas.reduce((t, l) => t + l.base_amount, 0),
    };
  }, [lineas, cargas]);

  const ajustar = (i: number, campo: 'bonuses' | 'advances' | 'other_deductions', v: string) => {
    const n = Math.max(0, Number(String(v).replace(/[^\d.]/g, '')) || 0);
    setLineas(prev => prev.map((l, j) => j === i ? { ...l, [campo]: n } : l));
  };

  const guardar = async () => {
    if (lineas.length === 0) return;
    setGuardando(true); setMsg(null);
    try {
      const run = await payrollService.save({
        period_start: from, period_end: to, items: lineas,
      });
      setMsg({ ok: true, text: `Planilla del ${dia(from)} al ${dia(to)} guardada. Ya se puede pagar.` });
      await Promise.all([cargar(), cargarHistorial()]);
      setVerHistorial(true);
      return run;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally { setGuardando(false); }
  };

  const pagar = async (run: PayrollRun) => {
    if (!window.confirm(
      `¿Marcar como PAGADA la planilla del ${dia(run.period_start)} al ${dia(run.period_end)}?\n\n`
      + `Neto a entregar: ${fmt(run.net)}\n`
      + `Se registra un gasto de ${fmt(run.total_cost)} (bruto + cargas patronales) `
      + 'para que aparezca en la utilidad del negocio.\n\n'
      + 'Una planilla pagada ya no se puede borrar.')) return;
    try {
      await payrollService.pay(run.id, { payment_method: 'transfer' });
      setMsg({ ok: true, text: 'Planilla pagada y registrada como gasto.' });
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo pagar' });
    }
  };

  const borrar = async (run: PayrollRun) => {
    if (!window.confirm(`¿Borrar la planilla del ${dia(run.period_start)} al ${dia(run.period_end)}?`)) return;
    try {
      await payrollService.remove(run.id);
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo borrar' });
    }
  };

  const exportCsv = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['Empleado', 'Cargo', 'Tipo', 'Horas', 'Base', 'Ventas del período', 'Comisión %',
        'Comisión', 'Bonos', 'Bruto', `CCSS obrero (${pct(cargas.obrero)})`,
        'Adelantos', 'Otros descuentos', 'Neto', 'Forma de pago'],
    ];
    lineas.forEach(l => {
      const bruto = l.base_amount + l.commission_amount + (l.bonuses ?? 0);
      const obrero = bruto * cargas.obrero;
      rows.push([
        l.employee_name, l.position ?? '', l.salary_type ?? '', l.hours ?? '',
        Math.round(l.base_amount), Math.round(l.commission_sales), l.commission_pct ?? '',
        Math.round(l.commission_amount), Math.round(l.bonuses ?? 0), Math.round(bruto),
        Math.round(obrero), Math.round(l.advances ?? 0), Math.round(l.other_deductions ?? 0),
        Math.round(bruto - obrero - (l.advances ?? 0) - (l.other_deductions ?? 0)),
        l.payment_method ?? '',
      ]);
    });
    rows.push([]);
    rows.push(['', '', '', '', 'TOTAL BRUTO', Math.round(totales.bruto)]);
    rows.push(['', '', '', '', 'Cargas patronales', Math.round(totales.patronal)]);
    rows.push(['', '', '', '', 'COSTO PARA EL NEGOCIO', Math.round(totales.costo)]);
    rows.push(['', '', '', '', 'NETO A ENTREGAR', Math.round(totales.neto)]);
    downloadCsv(`planilla-${from}_${to}`, rows);
  };

  const yaGuardada = prev?.existente ?? null;
  const runGuardada = historial.find(r => r.id === yaGuardada?.id);

  return (
    <div className="space-y-5">

      {/* Período */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Del</label>
          <input type="date" value={from} onChange={e => setPeriodo(p => ({ ...p, from: e.target.value }))}
            className="px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold" />
        </div>
        <div>
          <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Al</label>
          <input type="date" value={to} onChange={e => setPeriodo(p => ({ ...p, to: e.target.value }))}
            className="px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold" />
        </div>
        <button onClick={() => setPeriodo(mesDe())}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
          Este mes
        </button>
        <button onClick={() => setPeriodo(mesDe(new Date(new Date().setMonth(new Date().getMonth() - 1))))}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
          Mes pasado
        </button>
        <div className="flex-1" />
        <button onClick={() => void cargar()} disabled={cargando}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
          <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => { setVerHistorial(v => !v); }}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
          <History size={14} /> Planillas guardadas ({historial.length})
        </button>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
          msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {yaGuardada && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-3 flex-wrap ${
          yaGuardada.status === 'paid'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
          <span className="flex-1">
            {yaGuardada.status === 'paid'
              ? `Este período ya está PAGADO (${dia(yaGuardada.paid_at)}). Lo de abajo es solo el cálculo de referencia.`
              : 'Este período ya tiene una planilla guardada sin pagar.'}
          </span>
          {yaGuardada.status !== 'paid' && runGuardada && (
            <button onClick={() => void pagar(runGuardada)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5">
              <Banknote size={13} /> Pagarla
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Users} label="Empleados en planilla" value={String(lineas.length)} color="bg-blue-500" />
        <KPI icon={DollarSign} label="Salarios base" value={fmt(totales.base)} color="bg-emerald-500" />
        <KPI icon={TrendingUp} label="Comisiones" value={fmt(totales.comisiones)} color="bg-violet-500"
          sub={prev ? `sobre ${fmt(prev.totales.sales_total)} vendidos` : undefined} />
        <KPI icon={FileText} label="Costo para el negocio" value={fmt(totales.costo)} color="bg-orange-500"
          sub={`con cargas patronales (${pct(cargas.patronal)})`} />
      </div>

      {/* Resumen */}
      <div className="bg-linear-to-br from-amber-400 to-orange-500 rounded-3xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-80">
              Planilla del {dia(from)} al {dia(to)}
            </p>
            <h2 className="text-3xl font-black mt-1">{fmt(totales.neto)}</h2>
            <p className="text-white/80 text-xs">
              neto a entregar · bruto {fmt(totales.bruto)} · {lineas.length} empleados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={lineas.length === 0}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40">
              <Download size={14} /> CSV
            </button>
            {!yaGuardada && (
              <button onClick={() => void guardar()} disabled={guardando || lineas.length === 0}
                className="flex items-center gap-1.5 bg-white text-orange-700 px-4 py-2 rounded-lg text-xs font-black transition disabled:opacity-50">
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar la planilla
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {[
            ['Bruto', fmt(totales.bruto)],
            [`CCSS obrero ${pct(cargas.obrero)}`, `−${fmt(totales.obrero)}`],
            ['Adelantos y otros', `−${fmt(totales.descuentos)}`],
            [`Cargas patronales ${pct(cargas.patronal)}`, fmt(totales.patronal)],
          ].map(([t, v]) => (
            <div key={t} className="bg-white/15 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold uppercase opacity-80 leading-tight">{t}</p>
              <p className="text-sm font-black">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        {cargando ? (
          <p className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Armando la planilla del período…
          </p>
        ) : lineas.length === 0 ? (
          <p className="py-12 text-center text-gray-400 text-sm">
            No hay empleados activos para este período. Agregalos en «Empleados».
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-black">Empleado</th>
                <th className="px-3 py-2 text-right font-black">Base</th>
                <th className="px-3 py-2 text-right font-black">Comisión</th>
                <th className="px-3 py-2 text-right font-black">Bonos</th>
                <th className="px-3 py-2 text-right font-black">Adelantos</th>
                <th className="px-3 py-2 text-right font-black">Otros desc.</th>
                <th className="px-3 py-2 text-right font-black">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lineas.map((l, i) => {
                const bruto = l.base_amount + l.commission_amount + (l.bonuses ?? 0);
                const neto = bruto - bruto * cargas.obrero - (l.advances ?? 0) - (l.other_deductions ?? 0);
                return (
                  <tr key={l.employee_id ?? i}>
                    <td className="px-3 py-2">
                      <p className="font-bold text-gray-900">{l.employee_name}</p>
                      <p className="text-[11px] text-gray-500">
                        {[l.position,
                          l.salary_type === 'hourly' ? `${l.hours ?? 0} h × ${fmt(l.hourly_rate ?? 0)}` : null,
                          l.unpaid_days > 0 ? `${l.unpaid_days} día(s) sin goce` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(l.base_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className="font-bold">{fmt(l.commission_amount)}</span>
                      {l.commission_pct ? (
                        <span className="block text-[10px] text-gray-400">
                          {l.commission_pct}% de {fmt(l.commission_sales)}
                        </span>
                      ) : null}
                    </td>
                    {(['bonuses', 'advances', 'other_deductions'] as const).map(campo => (
                      <td key={campo} className="px-2 py-2 text-right">
                        <input
                          value={String(l[campo] ?? 0)}
                          onChange={e => ajustar(i, campo, e.target.value)}
                          disabled={!!yaGuardada}
                          inputMode="decimal"
                          className="w-20 px-2 py-1 text-right rounded-lg border border-gray-200 text-xs font-bold tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-black text-gray-900 tabular-nums">{fmt(neto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Las <b>horas</b> salen de los marcajes de asistencia del período; la <b>comisión</b>, de las
        ventas que cada uno facturó —cruzando su usuario del sistema con el cajero o el agente de
        cada factura—. Un empleado sin usuario vinculado no genera comisión por ventas. Las ausencias
        aprobadas <b>sin goce</b> se descuentan del salario fijo.
      </p>

      {/* Historial */}
      {verHistorial && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <History size={15} className="text-gray-500" />
            <p className="font-black text-gray-900 text-sm flex-1">Planillas guardadas</p>
          </div>
          {historial.length === 0 ? (
            <p className="py-8 text-center text-gray-400 text-sm">
              Todavía no hay planillas guardadas. Al guardar una, los montos quedan congelados:
              aunque después cambien los salarios, lo que se pagó no cambia.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {historial.map(r => (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">
                      {dia(r.period_start)} — {dia(r.period_end)}
                      <span className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded ${
                        r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {r.status === 'paid' ? 'PAGADA' : 'SIN PAGAR'}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {r.employees_count} empleado(s) · neto {fmt(r.net)} · costo {fmt(r.total_cost)}
                      {r.expense_id && (
                        <span className="inline-flex items-center gap-1 ml-1 text-emerald-700 font-bold">
                          <Receipt size={11} /> en Gastos
                        </span>
                      )}
                    </p>
                  </div>
                  {r.status !== 'paid' ? (
                    <>
                      <button onClick={() => void pagar(r)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5">
                        <Banknote size={13} /> Pagar
                      </button>
                      <button onClick={() => void borrar(r)} title="Borrar"
                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] font-bold text-gray-400">{dia(r.paid_at)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const KPI: React.FC<{
  icon: React.ElementType; label: string; value: string; color: string; sub?: string;
}> = ({ icon: Icon, label, value, color, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
    <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shrink-0`}>
      <Icon size={19} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-bold text-gray-500 uppercase leading-tight">{label}</p>
      <p className="text-lg font-black text-gray-900 truncate">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>}
    </div>
  </div>
);

export default SalaryManager;
