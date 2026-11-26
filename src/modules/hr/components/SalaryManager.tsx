'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DollarSign, Download, Users, TrendingUp, FileText, Loader2, Save, CheckCircle2,
  AlertCircle, Banknote, History, Trash2, RefreshCw, Receipt, SlidersHorizontal,
  ChevronDown, ChevronRight, ShieldAlert, Landmark, Scale, MinusCircle,
} from 'lucide-react';
import { payrollService } from '@/services/hr/hrService';
import { downloadCsv } from '@/utils/csv';
import type { PayrollItem, PayrollRun, Renglon, TasasPlanilla } from '../types/HR.types';
import { PayrollSettings } from './PayrollSettings';
import { DeduccionesEmpleado } from './DeduccionesEmpleado';

const fmt = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const pct = (n: number) => `${((Number(n) || 0) * 100).toFixed(2).replace('.', ',')}%`;

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
 * ── De dónde salen los números ───────────────────────────────────────────
 * Las horas, de los marcajes. La comisión, de las ventas que cada uno
 * facturó. Las ausencias sin goce, de las solicitudes aprobadas. Al guardar,
 * los montos quedan congelados: aunque mañana suba un salario o cambie el
 * IVM, lo que se pagó este mes no cambia.
 *
 * ── Por qué el navegador no calcula ──────────────────────────────────────
 * Esta pantalla deja ajustar bonificaciones y adelantos a mano. Para mostrar
 * el neto correcto habría que repetir acá los tramos del impuesto, los
 * créditos familiares, las deducciones de cada empleado y la base mínima
 * contributiva. Dos implementaciones del mismo cálculo se separan: una se
 * arregla y la otra no, y después nadie sabe cuál de los dos netos se va a
 * pagar. Así que al ajustar algo, la pantalla le PREGUNTA al servidor.
 *
 * Mientras la respuesta viene, se marca que los números están recalculándose
 * en vez de mostrar una cifra vieja como si fuera la buena.
 */
export const SalaryManager: React.FC = () => {
  const [{ from, to }, setPeriodo] = useState(mesDe());
  const [lineas, setLineas] = useState<PayrollItem[]>([]);
  const [totales, setTotales] = useState<any>(null);
  const [tasas, setTasas] = useState<TasasPlanilla | null>(null);
  const [cargas, setCargas] = useState({ obrero: 0.1083, patronal: 0.2583, ins: 0.01, vigente: '2026' });
  const [factor, setFactor] = useState(1);
  const [existente, setExistente] = useState<{ id: string; status: string; paid_at: string | null } | null>(null);
  const [ventas, setVentas] = useState(0);

  const [historial, setHistorial] = useState<PayrollRun[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [verTasas, setVerTasas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verDeducciones, setVerDeducciones] = useState<{ id: string; nombre: string } | null>(null);

  const absorber = (p: any) => {
    setLineas(Array.isArray(p?.lineas) ? p.lineas : []);
    setTotales(p?.totales ?? null);
    if (p?.tasas) setTasas(p.tasas);
    if (p?.cargas) setCargas(c => ({ ...c, ...p.cargas }));
    if (typeof p?.factor === 'number') setFactor(p.factor);
    if (typeof p?.totales?.sales_total === 'number') setVentas(p.totales.sales_total);
  };

  const cargar = useCallback(async () => {
    setCargando(true); setMsg(null);
    try {
      const p = await payrollService.preview(from, to);
      absorber(p);
      setExistente(p?.existente ?? null);
    } catch (e) {
      setLineas([]); setTotales(null);
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo calcular la planilla' });
    } finally { setCargando(false); }
  }, [from, to]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cargarHistorial = useCallback(async () => {
    try { setHistorial(await payrollService.list()); } catch { /* sin historial */ }
  }, []);
  useEffect(() => { void cargarHistorial(); }, [cargarHistorial]);

  /**
   * El recálculo, con una pausa.
   *
   * Sin la pausa, escribir «25000» en un adelanto manda cinco peticiones
   * —2, 25, 250, 2500, 25000— y la respuesta de la primera puede llegar
   * después de la última y pisar el número bueno. El contador de peticiones
   * descarta las que llegan fuera de orden.
   */
  const temporizador = useRef<number | null>(null);
  const turno = useRef(0);

  const recalcular = useCallback((items: PayrollItem[]) => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(async () => {
      const mio = ++turno.current;
      setRecalculando(true);
      try {
        const p = await payrollService.recalcular({ period_start: from, period_end: to, items });
        if (mio !== turno.current) return;        // llegó una respuesta más nueva
        absorber(p);
      } catch (e) {
        if (mio !== turno.current) return;
        setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo recalcular' });
      } finally {
        if (mio === turno.current) setRecalculando(false);
      }
    }, 650);
  }, [from, to]);

  useEffect(() => () => { if (temporizador.current) window.clearTimeout(temporizador.current); }, []);

  const ajustar = (i: number, campo: 'bonuses' | 'advances' | 'other_deductions', v: string) => {
    const n = Math.max(0, Number(String(v).replace(/[^\d.]/g, '')) || 0);
    setLineas(prev => {
      const next = prev.map((l, j) => j === i ? { ...l, [campo]: n } : l);
      recalcular(next);
      return next;
    });
  };

  const guardar = async () => {
    if (lineas.length === 0) return;
    setGuardando(true); setMsg(null);
    try {
      await payrollService.save({ period_start: from, period_end: to, items: lineas });
      setMsg({ ok: true, text: `Planilla del ${dia(from)} al ${dia(to)} guardada. Ya se puede pagar.` });
      await Promise.all([cargar(), cargarHistorial()]);
      setVerHistorial(true);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally { setGuardando(false); }
  };

  const pagar = async (run: PayrollRun) => {
    if (!window.confirm(
      `¿Marcar como PAGADA la planilla del ${dia(run.period_start)} al ${dia(run.period_end)}?\n\n`
      + `Neto a entregar: ${fmt(run.net)}\n`
      + `Se registra un gasto de ${fmt(run.total_cost)} (bruto + cargas patronales + INS) `
      + 'para que aparezca en la utilidad del negocio.\n\n'
      + 'Los préstamos bajan su saldo con lo que se les rebajó en esta planilla.\n\n'
      + 'Una planilla pagada ya no se puede borrar.')) return;
    try {
      const r: any = await payrollService.pay(run.id, { payment_method: 'transfer' });
      const ab = r?.abonos;
      setMsg({
        ok: true,
        text: 'Planilla pagada y registrada como gasto.'
          + (ab?.abonadas ? ` Se abonó a ${ab.abonadas} préstamo(s)` : '')
          + (ab?.saldadas ? `, ${ab.saldadas} quedó saldado y se apagó solo.` : ab?.abonadas ? '.' : ''),
      });
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

  /** Todos los avisos del período, sin repetir el mismo texto. */
  const avisos = useMemo(() => {
    const out: Array<{ quien: string; texto: string }> = [];
    for (const l of lineas) {
      for (const a of (l.avisos ?? [])) out.push({ quien: l.employee_name, texto: a });
    }
    return out;
  }, [lineas]);

  const exportCsv = () => {
    /* El CSV lleva el desglose completo: es lo que el contador necesita para
       cuadrar con la planilla de la CCSS, y lo que el trabajador necesita
       para entender su rebajo. Un CSV con «cargas: 54.150» no sirve para
       ninguna de las dos cosas. */
    const rubrosObrero = tasas?.obrero ?? [];
    const encabezado = [
      'Empleado', 'Cargo', 'Tipo', 'Horas', 'Base', 'Ventas del período', 'Comisión %',
      'Comisión', 'Bonos', 'Bruto', 'Base contributiva',
      ...rubrosObrero.map(r => `${r.label} (${r.pct}%)`),
      'Total cuota obrera', 'Impuesto sobre la renta',
      'Adelantos', 'Otras deducciones', 'Neto',
      'Cargas patronales', 'INS', 'Costo para el negocio', 'Forma de pago',
    ];
    const rows: (string | number | null | undefined)[][] = [encabezado];
    lineas.forEach(l => {
      const det = new Map((l.employee_charges_detail ?? []).map(r => [r.id, r.monto]));
      rows.push([
        l.employee_name, l.position ?? '', l.salary_type ?? '', l.hours ?? '',
        Math.round(l.base_amount), Math.round(l.commission_sales), l.commission_pct ?? '',
        Math.round(l.commission_amount), Math.round(l.bonuses ?? 0), Math.round(l.gross),
        l.contribution_base != null ? Math.round(l.contribution_base) : '',
        ...rubrosObrero.map(r => Math.round(Number(det.get(r.id) ?? 0))),
        Math.round(l.employee_charges), Math.round(l.income_tax ?? 0),
        Math.round(l.advances ?? 0),
        Math.round(Math.max(0, (l.deductions_detail ?? [])
          .filter(d => d.id !== 'adelantos')
          .reduce((s, d) => s + d.monto, 0))),
        Math.round(l.net),
        Math.round(l.employer_charges ?? 0), Math.round(l.ins_amount ?? 0),
        Math.round(l.gross + (l.employer_charges ?? 0) + (l.ins_amount ?? 0)),
        l.payment_method ?? '',
      ]);
    });
    if (totales) {
      rows.push([]);
      rows.push(['TOTALES']);
      rows.push(['Bruto', Math.round(totales.gross)]);
      for (const r of (totales.employee_charges_detail ?? []) as Renglon[]) {
        rows.push([`  ${r.label}`, Math.round(r.monto)]);
      }
      rows.push(['Total cuota obrera', Math.round(totales.employee_charges)]);
      rows.push(['Impuesto sobre la renta', Math.round(totales.income_tax ?? 0)]);
      rows.push(['Otras deducciones', Math.round(totales.other_deductions ?? 0)]);
      rows.push(['NETO A ENTREGAR', Math.round(totales.net)]);
      rows.push([]);
      for (const r of (totales.employer_charges_detail ?? []) as Renglon[]) {
        rows.push([`  ${r.label}`, Math.round(r.monto)]);
      }
      rows.push(['Total cargas patronales', Math.round(totales.employer_charges)]);
      rows.push(['INS — Riesgos del trabajo', Math.round(totales.ins_amount ?? 0)]);
      rows.push(['COSTO PARA EL NEGOCIO', Math.round(totales.total_cost)]);
      rows.push([]);
      rows.push([`Tasas usadas: año ${cargas.vigente}`]);
    }
    downloadCsv(`planilla-${from}_${to}`, rows);
  };

  const runGuardada = historial.find(r => r.id === existente?.id);
  const t = totales;

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
          className="px-3 h-9 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
          Este mes
        </button>
        <button onClick={() => setPeriodo(mesDe(new Date(new Date().setMonth(new Date().getMonth() - 1))))}
          className="px-3 h-9 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
          Mes pasado
        </button>
        <div className="flex-1" />
        {/* Las tasas: lo que el usuario pidió poder ajustar. */}
        <button onClick={() => setVerTasas(true)}
          className="px-3 h-9 rounded-xl border-2 border-indigo-200 text-indigo-700 text-xs font-black hover:bg-indigo-50 flex items-center gap-1.5">
          <SlidersHorizontal size={14} /> Tasas ({cargas.vigente})
        </button>
        <button onClick={() => void cargar()} disabled={cargando}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
          <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => setVerHistorial(v => !v)}
          className="px-3 h-9 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
          <History size={14} /> Planillas guardadas ({historial.length})
        </button>
      </div>

      {/* Una quincena no es un mes: los tramos del impuesto van a escala. */}
      {factor !== 1 && (
        <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
          El período cubre <b>{Math.round(factor * 100)}% de un mes</b>, así que los tramos del impuesto
          y la base mínima de la CCSS se aplicaron a esa escala. Si no, una quincena pagaría el
          impuesto como si fuera un mes completo.
        </p>
      )}

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
          msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {existente && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-3 flex-wrap ${
          existente.status === 'paid'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
          <span className="flex-1">
            {existente.status === 'paid'
              ? `Este período ya está PAGADO (${dia(existente.paid_at)}). Lo de abajo es solo el cálculo de referencia.`
              : 'Este período ya tiene una planilla guardada sin pagar.'}
          </span>
          {existente.status !== 'paid' && runGuardada && (
            <button onClick={() => void pagar(runGuardada)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5">
              <Banknote size={13} /> Pagarla
            </button>
          )}
        </div>
      )}

      {/* LOS AVISOS. Nunca cambian un número: lo señalan. */}
      {avisos.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-black text-amber-900 flex items-center gap-1.5 mb-1.5">
            <ShieldAlert size={15} /> {avisos.length} cosa(s) que conviene revisar
          </p>
          <ul className="space-y-1">
            {avisos.map((a, i) => (
              <li key={i} className="text-xs text-amber-900 leading-snug">
                <b>{a.quien}:</b> {a.texto}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Users} label="Empleados en planilla" value={String(lineas.length)} color="bg-blue-500" />
        <KPI icon={DollarSign} label="Salarios base" value={fmt(lineas.reduce((s, l) => s + l.base_amount, 0))} color="bg-emerald-500" />
        <KPI icon={TrendingUp} label="Comisiones" value={fmt(lineas.reduce((s, l) => s + l.commission_amount, 0))}
          color="bg-violet-500" sub={ventas ? `sobre ${fmt(ventas)} vendidos` : undefined} />
        <KPI icon={FileText} label="Costo para el negocio" value={fmt(t?.total_cost ?? 0)} color="bg-orange-500"
          sub={`bruto + ${pct(cargas.patronal)} de cargas + ${pct(cargas.ins ?? 0)} de INS`} />
      </div>

      {/* RESUMEN */}
      <div className="bg-linear-to-br from-amber-400 to-orange-500 rounded-3xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-80">
              Planilla del {dia(from)} al {dia(to)}
            </p>
            <h2 className="text-3xl font-black mt-1 flex items-center gap-2">
              {fmt(t?.net ?? 0)}
              {recalculando && <Loader2 size={20} className="animate-spin opacity-80" />}
            </h2>
            <p className="text-white/80 text-xs">
              neto a entregar · bruto {fmt(t?.gross ?? 0)} · {lineas.length} empleados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={lineas.length === 0}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md px-3 h-9 rounded-lg text-xs font-bold transition disabled:opacity-40">
              <Download size={14} /> CSV
            </button>
            {!existente && (
              <button onClick={() => void guardar()} disabled={guardando || recalculando || lineas.length === 0}
                className="flex items-center gap-1.5 bg-white text-orange-700 px-4 h-9 rounded-lg text-xs font-black transition disabled:opacity-50">
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar la planilla
              </button>
            )}
          </div>
        </div>

        {/* LO QUE SE LE REBAJA AL TRABAJADOR */}
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mt-5 mb-1.5">
          Se le rebaja al trabajador
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Chip t="Bruto" v={fmt(t?.gross ?? 0)} />
          <Chip t={`Cuota obrera ${pct(cargas.obrero)}`} v={`−${fmt(t?.employee_charges ?? 0)}`} />
          <Chip t="Impuesto sobre la renta" v={`−${fmt(t?.income_tax ?? 0)}`} />
          <Chip t="Otras deducciones" v={`−${fmt(t?.other_deductions ?? 0)}`} />
        </div>

        {/* LO QUE PAGA EL NEGOCIO ADEMÁS */}
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mt-4 mb-1.5">
          Paga el negocio además del salario
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Chip t={`Cargas patronales ${pct(cargas.patronal)}`} v={fmt(t?.employer_charges ?? 0)} />
          <Chip t={`INS riesgos del trabajo ${pct(cargas.ins ?? 0)}`} v={fmt(t?.ins_amount ?? 0)} />
          <Chip t="Costo total" v={fmt(t?.total_cost ?? 0)} />
        </div>
      </div>

      {/* EL DESGLOSE DEL PERÍODO, rubro por rubro */}
      {t?.employee_charges_detail?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Desglose titulo="Cuota obrera del período" icono={MinusCircle} color="text-amber-700"
            nota="Lo que se le rebaja a la gente y el negocio le traslada a cada institución."
            renglones={t.employee_charges_detail} total={t.employee_charges} />
          <Desglose titulo="Cuota patronal del período" icono={Landmark} color="text-indigo-700"
            nota="Lo que el negocio paga encima del salario. El INS va aparte: es una póliza, no una carga de la CCSS."
            renglones={[
              ...(t.employer_charges_detail ?? []),
              ...(t.ins_amount ? [{ id: 'ins', label: tasas?.ins.label ?? 'INS — Riesgos del trabajo', pct: (cargas.ins ?? 0) * 100, monto: t.ins_amount }] : []),
            ]}
            total={(t.employer_charges ?? 0) + (t.ins_amount ?? 0)} />
        </div>
      ) : null}

      {/* DETALLE POR EMPLEADO */}
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
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-black">Empleado</th>
                <th className="px-3 py-2 text-right font-black">Base</th>
                <th className="px-3 py-2 text-right font-black">Comisión</th>
                <th className="px-3 py-2 text-right font-black">Bonos</th>
                <th className="px-3 py-2 text-right font-black">Bruto</th>
                <th className="px-3 py-2 text-right font-black">Cuota obrera</th>
                <th className="px-3 py-2 text-right font-black">Renta</th>
                <th className="px-3 py-2 text-right font-black">Adelantos</th>
                <th className="px-3 py-2 text-right font-black">Otros desc.</th>
                <th className="px-3 py-2 text-right font-black">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lineas.map((l, i) => {
                const clave = l.employee_id ?? String(i);
                const expandida = abierta === clave;
                const otras = (l.deductions_detail ?? []).filter(d => d.id !== 'adelantos' && d.id !== 'otros');
                return (
                  <React.Fragment key={clave}>
                    <tr className={expandida ? 'bg-indigo-50/40' : ''}>
                      <td className="px-3 py-2">
                        <button onClick={() => setAbierta(expandida ? null : clave)}
                          className="flex items-start gap-1.5 text-left">
                          {expandida ? <ChevronDown size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                            : <ChevronRight size={14} className="text-gray-300 mt-0.5 shrink-0" />}
                          <span>
                            <span className="font-bold text-gray-900 block">{l.employee_name}</span>
                            <span className="text-[11px] text-gray-500">
                              {[l.position,
                                l.salary_type === 'hourly' ? `${l.hours ?? 0} h × ${fmt(l.hourly_rate ?? 0)}` : null,
                                l.unpaid_days > 0 ? `${l.unpaid_days} día(s) sin goce` : null,
                              ].filter(Boolean).join(' · ')}
                            </span>
                            {(l.avisos ?? []).length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700">
                                <ShieldAlert size={10} /> revisar
                              </span>
                            )}
                          </span>
                        </button>
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
                      <td className="px-2 py-2 text-right">
                        <input value={String(l.bonuses ?? 0)} onChange={e => ajustar(i, 'bonuses', e.target.value)}
                          disabled={!!existente} inputMode="decimal"
                          className="w-20 px-2 py-1 text-right rounded-lg border border-gray-200 text-xs font-bold tabular-nums disabled:bg-gray-50 disabled:text-gray-400" />
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-700">{fmt(l.gross)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">−{fmt(l.employee_charges)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                        {l.income_tax ? `−${fmt(l.income_tax)}` : <span className="text-gray-300">—</span>}
                      </td>
                      {(['advances', 'other_deductions'] as const).map(campo => (
                        <td key={campo} className="px-2 py-2 text-right">
                          <input value={String(l[campo] ?? 0)} onChange={e => ajustar(i, campo, e.target.value)}
                            disabled={!!existente} inputMode="decimal"
                            className="w-20 px-2 py-1 text-right rounded-lg border border-gray-200 text-xs font-bold tabular-nums disabled:bg-gray-50 disabled:text-gray-400" />
                          {campo === 'other_deductions' && otras.length > 0 && (
                            <span className="block text-[10px] text-gray-400 mt-0.5">
                              +{fmt(otras.reduce((s, d) => s + d.monto, 0))} fijas
                            </span>
                          )}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right font-black tabular-nums ${
                        l.net < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(l.net)}</td>
                    </tr>

                    {expandida && (
                      <tr className="bg-indigo-50/40">
                        <td colSpan={10} className="px-3 pb-4 pt-1">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <MiniDesglose titulo="Cuota obrera" renglones={l.employee_charges_detail ?? []}
                              total={l.employee_charges} vacio="Sin cuota obrera." />
                            <MiniDesglose titulo="Impuesto sobre la renta"
                              renglones={l.income_tax_detail ?? []} total={l.income_tax ?? 0}
                              vacio="No alcanza el tramo gravado: no se retiene impuesto." />
                            <MiniDesglose titulo="Deducciones" renglones={l.deductions_detail ?? []}
                              total={(l.deductions_detail ?? []).reduce((s, d) => s + d.monto, 0)}
                              vacio="Sin deducciones." />
                            <MiniDesglose titulo="Cuota patronal (la paga el negocio)"
                              renglones={[
                                ...(l.employer_charges_detail ?? []),
                                ...(l.ins_amount ? [{ id: 'ins', label: 'INS — Riesgos del trabajo', pct: 0, monto: l.ins_amount }] : []),
                              ]}
                              total={(l.employer_charges ?? 0) + (l.ins_amount ?? 0)}
                              vacio="Sin cargas patronales." />
                            <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs space-y-1">
                              <p className="font-black text-gray-900 mb-1">Resumen</p>
                              <Fila k="Bruto" v={fmt(l.gross)} />
                              {l.contribution_base != null && Math.round(l.contribution_base) !== Math.round(l.gross) && (
                                <Fila k="Base contributiva" v={fmt(l.contribution_base)}
                                  nota="Las cuotas se calcularon sobre este monto, no sobre el bruto." />
                              )}
                              <Fila k="Neto a entregar" v={fmt(l.net)} fuerte />
                              <Fila k="Costo para el negocio"
                                v={fmt(l.gross + (l.employer_charges ?? 0) + (l.ins_amount ?? 0))} />
                            </div>
                            <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs">
                              <p className="font-black text-gray-900 mb-1">Deducciones fijas</p>
                              <p className="text-gray-500 leading-snug mb-2">
                                Préstamos, solidarista, pensión alimentaria, embargos. Se rebajan todos
                                los meses, aparte de los adelantos de este período.
                              </p>
                              {l.employee_id && (
                                <button onClick={() => setVerDeducciones({ id: l.employee_id!, nombre: l.employee_name })}
                                  className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold">
                                  Ver y editar
                                </button>
                              )}
                            </div>
                          </div>
                          {(l.avisos ?? []).length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {(l.avisos ?? []).map((a, j) => (
                                <li key={j} className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-snug">
                                  {a}
                                </li>
                              ))}
                            </ul>
                          )}
                          {l.notes && <p className="text-xs text-gray-500 mt-2">{l.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-gray-400 leading-snug">
        Las <b>horas</b> salen de los marcajes del período; la <b>comisión</b>, de las ventas que cada
        uno facturó —cruzando su usuario del sistema con el cajero o el agente de cada factura—. Un
        empleado sin usuario vinculado no genera comisión por ventas. Las ausencias aprobadas <b>sin
        goce</b> se descuentan del salario fijo. Las <b>cuotas, el impuesto y las deducciones</b> los
        calcula el servidor con las tasas de {cargas.vigente}: tocá «Tasas» para verlas o ajustarlas.
        Al guardar la planilla, el desglose queda congelado con ella.
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
              aunque después cambien los salarios o las tasas, lo que se pagó no cambia.
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
                      {r.income_tax ? ` · renta ${fmt(r.income_tax)}` : ''}
                      {r.ins_amount ? ` · INS ${fmt(r.ins_amount)}` : ''}
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

      {verTasas && (
        <PayrollSettings onCerrar={() => setVerTasas(false)}
          onGuardado={() => { void cargar(); }} />
      )}
      {verDeducciones && (
        <DeduccionesEmpleado employeeId={verDeducciones.id} employeeName={verDeducciones.nombre}
          onCerrar={() => { setVerDeducciones(null); void cargar(); }} />
      )}
    </div>
  );
};

const Chip: React.FC<{ t: string; v: string }> = ({ t, v }) => (
  <div className="bg-white/15 rounded-xl px-3 py-2">
    <p className="text-[10px] font-bold uppercase opacity-80 leading-tight">{t}</p>
    <p className="text-sm font-black">{v}</p>
  </div>
);

const Desglose: React.FC<{
  titulo: string; icono: React.ElementType; color: string; nota: string;
  renglones: Renglon[]; total: number;
}> = ({ titulo, icono: Icono, color, nota, renglones, total }) => (
  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
    <div className="px-4 py-2.5 border-b border-gray-100">
      <h3 className={`text-sm font-black flex items-center gap-1.5 ${color}`}>
        <Icono size={14} /> {titulo}
      </h3>
      <p className="text-[11px] text-gray-400 leading-snug">{nota}</p>
    </div>
    <div className="divide-y divide-gray-50">
      {renglones.map(r => (
        <div key={r.id} className="px-4 py-1.5 flex justify-between gap-3 text-xs">
          <span className="text-gray-700 truncate">
            {r.label}
            {r.pct > 0 && <span className="text-gray-400"> · {String(r.pct).replace('.', ',')}%</span>}
          </span>
          <span className="tabular-nums font-semibold text-gray-900 shrink-0">{fmt(r.monto)}</span>
        </div>
      ))}
    </div>
    <div className="px-4 py-2 bg-gray-50 flex justify-between text-sm font-black">
      <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
    </div>
  </div>
);

const MiniDesglose: React.FC<{
  titulo: string; renglones: Renglon[]; total: number; vacio: string;
}> = ({ titulo, renglones, total, vacio }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs">
    <p className="font-black text-gray-900 mb-1 flex items-center gap-1.5">
      <Scale size={12} className="text-gray-400" /> {titulo}
    </p>
    {renglones.length === 0 ? (
      <p className="text-gray-500 leading-snug">{vacio}</p>
    ) : (
      <>
        {renglones.map(r => (
          <div key={r.id} className="flex justify-between gap-2 py-0.5 border-b border-gray-50 last:border-0">
            <span className="text-gray-600 truncate">
              {r.label}
              {r.pct > 0 && <span className="text-gray-400"> {String(r.pct).replace('.', ',')}%</span>}
            </span>
            <span className={`tabular-nums font-semibold shrink-0 ${r.monto < 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
              {r.monto < 0 ? `+${fmt(-r.monto)}` : fmt(r.monto)}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-2 pt-1 mt-1 border-t border-gray-200 font-black">
          <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
        </div>
      </>
    )}
  </div>
);

const Fila: React.FC<{ k: string; v: string; nota?: string; fuerte?: boolean }> =
  ({ k, v, nota, fuerte }) => (
  <>
    <div className={`flex justify-between gap-2 ${fuerte ? 'font-black' : ''}`}>
      <span className={fuerte ? 'text-gray-900' : 'text-gray-600'}>{k}</span>
      <span className="tabular-nums text-gray-900">{v}</span>
    </div>
    {nota && <p className="text-[10px] text-gray-400 leading-snug">{nota}</p>}
  </>
);

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
