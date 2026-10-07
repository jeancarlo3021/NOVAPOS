import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet, RefreshCw, Search, Download, AlertTriangle, Loader2, TrendingUp, Zap,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Senal = 'sobre_cuota' | 'al_limite' | 'holgado' | 'paga_y_no_usa' | 'sin_plan' | 'ilimitado' | 'normal';

interface FilaFe {
  titular: string;
  name: string;
  is_demo: boolean;
  status: string;
  cedula: string;
  miembros: { id: string; name: string }[];
  plan_saas: string | null;
  plan_saas_precio: number | null;
  fe_plan_id: string | null;
  fe_plan_name: string | null;
  fe_plan_precio: number | null;
  incluidos_plan: number;
  arrastre: number;
  incluidos: number;
  precio_extra: number;
  bolsa_desde: string | null;
  usados_bolsa: number;
  disponibles: number | null;
  excedente: number;
  cargo_extra: number;
  pct_bolsa: number | null;
  por_mes: Record<string, number>;
  total_periodo: number;
  promedio_mes: number;
  mejor_mes: number;
  notas: number;
  rechazados: number;
  monto_facturado: number;
  ultimo: string | null;
  dias_sin_emitir: number | null;
  senal: Senal;
}

interface PlanFe {
  id: string;
  name: string;
  price: number;
  docs_per_month: number | null;
  extra_doc_price: number;
}

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const num = (n: number) => Number(n || 0).toLocaleString('es-CR');
const VENTANAS = [3, 6, 12] as const;

const SENAL: Record<Senal, { texto: string; clase: string; fila: string }> = {
  sobre_cuota:   { texto: 'Se pasó de la bolsa', clase: 'bg-red-100 text-red-700',        fila: 'bg-red-50/50' },
  al_limite:     { texto: 'Al límite',           clase: 'bg-amber-100 text-amber-700',    fila: 'bg-amber-50/50' },
  paga_y_no_usa: { texto: 'Paga y no emite',     clase: 'bg-purple-100 text-purple-700',  fila: 'bg-purple-50/40' },
  holgado:       { texto: 'Le sobra bolsa',      clase: 'bg-sky-100 text-sky-700',        fila: '' },
  sin_plan:      { texto: 'Emite sin plan',      clase: 'bg-orange-100 text-orange-700',  fila: 'bg-orange-50/40' },
  ilimitado:     { texto: 'Ilimitado',           clase: 'bg-emerald-100 text-emerald-700', fila: '' },
  normal:        { texto: 'Al día',              clase: 'bg-gray-100 text-gray-600',      fila: '' },
};

const hace = (dias: number | null) =>
  dias == null ? 'nunca' : dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;

/** «2026-10» → «oct 26», que es lo que cabe en el encabezado. */
const mesCorto = (iso: string): string => {
  const [y, m] = iso.split('-');
  const n = Number(m);
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  return `${nombres[n - 1] ?? m} ${String(y).slice(2)}`;
};

/**
 * El plan que le queda bien, según lo que de verdad emite.
 *
 * Se mide contra el MES MÁS ALTO, no contra el promedio: el promedio de un
 * negocio que factura fuerte en diciembre y flojo en febrero le recomienda un
 * plan que se le va a quedar corto justo en diciembre, que es cuando le
 * importa. Se deja un 15% de aire para que no se pase por diez comprobantes.
 */
function planQueLeQueda(f: FilaFe, planes: PlanFe[]): PlanFe | null {
  const necesita = Math.ceil(Math.max(f.mejor_mes, f.promedio_mes) * 1.15);
  if (necesita <= 0) return null;
  const ordenados = [...planes].sort((a, b) => (a.docs_per_month ?? 1e9) - (b.docs_per_month ?? 1e9));
  return ordenados.find(p => p.docs_per_month == null || p.docs_per_month >= necesita) ?? null;
}

/**
 * USO DE FACTURACIÓN ELECTRÓNICA (Panel Admin).
 *
 * Es la pantalla para ir a ofrecer. Cada fila es una RAZÓN SOCIAL —la bolsa se
 * cobra así: una sociedad con tres actividades tiene una sola— y dice lo que
 * hay que saber antes de llamar:
 *
 *   quién se pasó de la bolsa, que es plata que ya se ganó y hay que cobrar o
 *   convertir en un plan más grande;
 *
 *   quién está al límite, que es el que hay que llamar ANTES de que se le
 *   acaben los comprobantes y no pueda facturar;
 *
 *   quién paga el plan y no emite nada, que es el que no renueva el mes que
 *   viene si nadie lo llama;
 *
 *   a quién le están rechazando comprobantes, que casi siempre es un dato mal
 *   puesto y el cliente no se dio cuenta.
 */
export const FeUsageReport: React.FC = () => {
  const [meses, setMeses] = useState<number>(6);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaFe[]>([]);
  const [planes, setPlanes] = useState<PlanFe[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [verDemos, setVerDemos] = useState(false);
  const [soloSenal, setSoloSenal] = useState<Senal | 'todas'>('todas');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await apiFetch<{ meses: string[]; negocios: FilaFe[]; planes: PlanFe[] }>(
        `/admin/fe-usage?months=${meses}`, undefined, 120_000);
      setEtiquetas(Array.isArray(r?.meses) ? r.meses : []);
      setFilas(Array.isArray(r?.negocios) ? r.negocios : []);
      setPlanes(Array.isArray(r?.planes) ? r.planes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el uso de facturación electrónica');
    } finally { setCargando(false); }
  }, [meses]);

  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return filas.filter(f =>
      (verDemos || !f.is_demo)
      && (soloSenal === 'todas' || f.senal === soloSenal)
      && (!texto
        || f.name.toLowerCase().includes(texto)
        || (f.fe_plan_name ?? '').toLowerCase().includes(texto)
        || f.cedula.includes(texto)
        || f.miembros.some(m => m.name.toLowerCase().includes(texto))));
  }, [filas, q, verDemos, soloSenal]);

  const resumen = useMemo(() => {
    const base = filas.filter(f => !f.is_demo);
    const cuenta = (s: Senal) => base.filter(f => f.senal === s).length;
    return {
      razones: base.length,
      comprobantes: base.reduce((t, f) => t + f.total_periodo, 0),
      ingreso: base.reduce((t, f) => t + (f.fe_plan_precio ?? 0), 0),
      extras: base.reduce((t, f) => t + f.cargo_extra, 0),
      rechazados: base.reduce((t, f) => t + f.rechazados, 0),
      sobre: cuenta('sobre_cuota'),
      limite: cuenta('al_limite'),
      dormidos: cuenta('paga_y_no_usa'),
      sinPlan: cuenta('sin_plan'),
    };
  }, [filas]);

  const csv = () => {
    const cab = ['Razon social', 'Cedula', 'Negocios', 'Plan FE', 'Precio plan', 'Incluidos', 'Arrastre',
      'Usados bolsa', 'Disponibles', 'Excedente', 'Cargo extra', '% bolsa',
      ...etiquetas, 'Total periodo', 'Promedio mes', 'Mejor mes', 'Notas', 'Rechazados',
      'Facturado', 'Ultima emision', 'Senal', 'Plan sugerido'];
    const cuerpo = visibles.map(f => {
      const sug = planQueLeQueda(f, planes);
      return [
        f.name, f.cedula, f.miembros.length, f.fe_plan_name ?? '', f.fe_plan_precio ?? '',
        f.incluidos_plan, f.arrastre, f.usados_bolsa, f.disponibles ?? 'ilimitado',
        f.excedente, f.cargo_extra, f.pct_bolsa ?? '',
        ...etiquetas.map(m => f.por_mes[m] ?? 0),
        f.total_periodo, f.promedio_mes, f.mejor_mes, f.notas, f.rechazados,
        f.monto_facturado, f.ultimo ?? '', SENAL[f.senal].texto,
        sug && sug.id !== f.fe_plan_id ? sug.name : '',
      ];
    });
    const texto = [cab, ...cuerpo]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `uso-facturacion-electronica-${meses}m.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Barrita de un mes, para ver la tendencia sin leer los números. */
  const Barra: React.FC<{ valor: number; tope: number }> = ({ valor, tope }) => (
    <div className="flex flex-col items-center gap-0.5 w-7" title={`${num(valor)} comprobantes`}>
      <div className="h-7 w-full flex items-end">
        <div className={`w-full rounded-sm ${valor === 0 ? 'bg-gray-100' : 'bg-emerald-400'}`}
          style={{ height: `${tope > 0 ? Math.max(valor > 0 ? 8 : 2, (valor / tope) * 100) : 2}%` }} />
      </div>
      <span className="text-[9px] font-bold text-gray-400 tabular-nums">{valor || ''}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={17} className="text-emerald-600" /> Uso de facturación electrónica
          </h3>
          <p className="text-sm text-gray-500">
            Una fila por razón social —la bolsa se cobra así—, con lo que emitió cada mes y cómo va contra
            su plan. Sirve para saber a quién llamar: el que se pasó, el que está por quedarse sin
            comprobantes y el que paga y no emite.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {VENTANAS.map(m => (
              <button key={m} onClick={() => setMeses(m)}
                className={`px-3 py-2 text-xs font-bold ${
                  meses === m ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {m} meses
              </button>
            ))}
          </div>
          <button onClick={() => void cargar()} disabled={cargando}
            title="Actualizar" className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={csv} disabled={visibles.length === 0}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertTriangle size={16} className="mt-0.5" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Razones sociales con FE', num(resumen.razones), 'text-gray-900'],
          ['Comprobantes del período', num(resumen.comprobantes), 'text-gray-900'],
          ['Planes de FE al mes', money(resumen.ingreso), 'text-emerald-600'],
          ['Excedentes por cobrar', money(resumen.extras), resumen.extras > 0 ? 'text-red-600' : 'text-gray-400'],
          ['Rechazados', num(resumen.rechazados), resumen.rechazados > 0 ? 'text-amber-600' : 'text-gray-400'],
        ].map(([t, v, color]) => (
          <div key={t} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase">{t}</p>
            <p className={`text-lg font-black ${color}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* A quién llamar hoy. Cada botón filtra la tabla. */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['todas', `Todas (${filas.filter(f => verDemos || !f.is_demo).length})`],
          ['sobre_cuota', `Se pasaron (${resumen.sobre})`],
          ['al_limite', `Al límite (${resumen.limite})`],
          ['paga_y_no_usa', `Pagan y no emiten (${resumen.dormidos})`],
          ['sin_plan', `Emiten sin plan (${resumen.sinPlan})`],
        ] as const).map(([s, texto]) => (
          <button key={s} onClick={() => setSoloSenal(s as Senal | 'todas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition ${
              soloSenal === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-300'}`}>
            {texto}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar negocio, cédula o plan de FE…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={verDemos} onChange={e => setVerDemos(e.target.checked)}
            className="w-4 h-4 accent-emerald-600" />
          Incluir demos
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        {cargando ? (
          <p className="py-14 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Contando comprobantes de {meses} meses…
          </p>
        ) : visibles.length === 0 ? (
          <p className="py-14 text-center text-gray-400 text-sm">
            {filas.length === 0
              ? 'Todavía no hay negocios emitiendo comprobantes electrónicos.'
              : 'Ningún negocio cumple con el filtro.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wide text-gray-500">Razón social</th>
                <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wide text-gray-500">Plan de FE</th>
                <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wide text-gray-500">Bolsa vigente</th>
                <th className="px-3 py-2 text-center font-black text-[11px] uppercase tracking-wide text-gray-500">
                  Por mes
                  <div className="flex gap-1 justify-center mt-1 font-bold text-[9px] text-gray-400">
                    {etiquetas.map(m => <span key={m} className="w-7">{mesCorto(m)}</span>)}
                  </div>
                </th>
                <th className="px-3 py-2 text-right font-black text-[11px] uppercase tracking-wide text-gray-500">Mes típico</th>
                <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wide text-gray-500">Qué hacer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibles.map(f => {
                const tope = Math.max(1, ...etiquetas.map(m => f.por_mes[m] ?? 0));
                const sug = planQueLeQueda(f, planes);
                const subir = !!sug && sug.id !== f.fe_plan_id
                  && (sug.docs_per_month ?? Infinity) > (f.incluidos_plan || 0);
                return (
                  <tr key={f.titular} className={SENAL[f.senal].fila}>
                    <td className="px-3 py-2 align-top">
                      <p className="font-bold text-gray-900 flex items-center gap-1.5">
                        {f.name}
                        {f.is_demo && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">DEMO</span>}
                        {f.status !== 'active' && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{f.status}</span>}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {f.cedula || 'sin cédula'}
                        {f.miembros.length > 1 && (
                          <span title={f.miembros.map(m => m.name).join('\n')}>
                            {' · '}{f.miembros.length} negocios
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {f.rechazados > 0 && (
                          <span className="text-amber-600 font-bold">{num(f.rechazados)} rechazados · </span>
                        )}
                        emitió {hace(f.dias_sin_emitir)}
                      </p>
                    </td>

                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <p className="font-bold text-gray-800">{f.fe_plan_name ?? <span className="text-gray-400">sin plan de FE</span>}</p>
                      <p className="text-[11px] text-gray-500">
                        {f.fe_plan_precio ? `${money(f.fe_plan_precio)}/mes` : ''}
                        {f.plan_saas ? `${f.fe_plan_precio ? ' · ' : ''}SaaS: ${f.plan_saas}` : ''}
                      </p>
                    </td>

                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {f.incluidos > 0 ? (
                        <>
                          <p className="font-black text-gray-900 tabular-nums">
                            {num(f.usados_bolsa)} / {num(f.incluidos)}
                            {f.arrastre > 0 && (
                              <span className="text-[10px] font-bold text-gray-400"> (incl. {num(f.arrastre)} de arrastre)</span>
                            )}
                          </p>
                          <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden mt-1">
                            <div className={`h-full rounded-full ${
                              f.excedente > 0 ? 'bg-red-500' : (f.pct_bolsa ?? 0) >= 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, f.pct_bolsa ?? 0)}%` }} />
                          </div>
                          <p className="text-[11px] font-bold text-gray-500">
                            {f.excedente > 0
                              ? <span className="text-red-600">{num(f.excedente)} de más · {money(f.cargo_extra)} por cobrar</span>
                              : `quedan ${num(f.disponibles ?? 0)} · ${f.pct_bolsa}%`}
                          </p>
                        </>
                      ) : (
                        <p className="font-bold text-emerald-700">∞ sin límite</p>
                      )}
                    </td>

                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-1 justify-center">
                        {etiquetas.map(m => <Barra key={m} valor={f.por_mes[m] ?? 0} tope={tope} />)}
                      </div>
                    </td>

                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      <p className="font-black text-gray-900 tabular-nums">{num(f.promedio_mes)}</p>
                      <p className="text-[11px] text-gray-500">pico {num(f.mejor_mes)}</p>
                      <p className="text-[11px] text-gray-400">{num(f.total_periodo)} en {meses}m</p>
                    </td>

                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full ${SENAL[f.senal].clase}`}>
                        {SENAL[f.senal].texto}
                      </span>
                      {subir && (
                        <p className="text-[11px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                          <TrendingUp size={11} /> Ofrecer {sug!.name}
                          {sug!.price ? ` · ${money(sug!.price)}` : ''}
                        </p>
                      )}
                      {f.senal === 'paga_y_no_usa' && (
                        <p className="text-[11px] font-bold text-purple-700 mt-1 flex items-center gap-1">
                          <Zap size={11} /> Llamar: no está facturando
                        </p>
                      )}
                      {f.senal === 'sin_plan' && (
                        <p className="text-[11px] font-bold text-orange-700 mt-1 flex items-center gap-1">
                          <TrendingUp size={11} /> Emite sin bolsa: asignarle plan
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Cuenta cada CLAVE enviada a Hacienda: facturas, tiquetes, notas de crédito y de débito. Los
        rechazados no gastan bolsa —no son comprobantes válidos— pero se muestran porque casi siempre
        son un dato mal puesto que el cliente no vio. «Bolsa vigente» se cuenta desde la última
        renovación de la bolsa, no desde el primero de mes, e incluye los comprobantes que sobraron de
        la bolsa anterior. El plan sugerido se mide contra el mes más alto, con un 15% de aire.
      </p>
    </div>
  );
};

export default FeUsageReport;
