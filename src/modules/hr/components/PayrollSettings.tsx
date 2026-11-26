'use client';

import React from 'react';
import {
  X, Loader2, Save, RotateCcw, ShieldAlert, Info, Plus, Trash2,
} from 'lucide-react';
import { payrollService } from '@/services/hr/hrService';
import type { TasasPlanilla, TasaConfig } from '../types/HR.types';

/**
 * LAS TASAS DE LA PLANILLA.
 *
 * ── Por qué esto es una pantalla y no una constante ──────────────────────
 * Las tasas cambian por ley cada año: el IVM subió el 1.º de enero de 2026 y
 * los tramos del impuesto se ajustan por decreto cada diciembre. Si vivieran
 * en el código, cada enero habría que esperar una versión nueva para que la
 * planilla saliera bien — y mientras tanto sale mal, sin que nadie lo note.
 *
 * ── Las dos cosas que el sistema NO decide por su cuenta ─────────────────
 * 1. La tarifa del INS. El 1% es referencial; la real está en la póliza del
 *    negocio y depende de su actividad. Una soda y un taller no pagan lo
 *    mismo, y poner un número parejo para todos sería inventar.
 * 2. La base del impuesto sobre la renta. Las fuentes se contradicen sobre si
 *    se calcula sobre el bruto o sobre el bruto menos la cuota obrera. Las
 *    dos opciones están acá con el número a la vista en vez de elegir en
 *    silencio.
 */

const crc = (n: any) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const pctTxt = (n: any) => `${(Number(n) || 0).toFixed(2).replace('.', ',')}%`;

const sumaPct = (xs: Array<{ pct: number }>) =>
  Math.round(xs.reduce((s, x) => s + (Number(x.pct) || 0), 0) * 1000) / 1000;

export const PayrollSettings: React.FC<{ onCerrar: () => void; onGuardado?: () => void }> =
  ({ onCerrar, onGuardado }) => {
  const [t, setT] = React.useState<TasasPlanilla | null>(null);
  const [omision, setOmision] = React.useState<TasasPlanilla | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState('');
  const [aviso, setAviso] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    payrollService.settings()
      .then(r => { if (vivo) { setT(r.tasas); setOmision(r.por_omision); } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar las tasas'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const set = <K extends keyof TasasPlanilla>(k: K, v: TasasPlanilla[K]) =>
    setT(x => (x ? { ...x, [k]: v } : x));

  const setRubro = (lista: 'obrero' | 'patronal', i: number, pct: string) =>
    setT(x => {
      if (!x) return x;
      const copia = [...x[lista]];
      copia[i] = { ...copia[i], pct: Number(pct) || 0 };
      return { ...x, [lista]: copia };
    });

  const guardar = async () => {
    if (!t) return;
    setGuardando(true); setError(''); setAviso('');
    try {
      const r = await payrollService.saveSettings(t);
      setT(r.tasas);
      setAviso('Tasas guardadas. La próxima planilla que se calcule las usa.');
      onGuardado?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  if (cargando) {
    return (
      <Marco onCerrar={onCerrar}>
        <p className="text-sm text-gray-500 flex items-center gap-2 p-6">
          <Loader2 size={14} className="animate-spin" /> Cargando las tasas…
        </p>
      </Marco>
    );
  }
  if (!t) {
    return (
      <Marco onCerrar={onCerrar}>
        <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 m-6">
          {error || 'No se pudieron cargar las tasas.'}
        </p>
      </Marco>
    );
  }

  const totalObrero = sumaPct(t.obrero);
  const totalPatronal = sumaPct(t.patronal);
  const conIns = Math.round((totalPatronal + (t.ins.activo ? Number(t.ins.pct) || 0 : 0)) * 1000) / 1000;

  return (
    <Marco onCerrar={onCerrar}>
      <div className="p-4 sm:p-6 space-y-5">
        {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
        {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        {/* EL RESUMEN, arriba: es lo que la gente quiere confirmar de un vistazo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Resumen titulo="Se le rebaja al trabajador" valor={pctTxt(totalObrero)}
            nota="Cuota obrera: CCSS y Banco Popular." color="text-amber-700" />
          <Resumen titulo="Paga el negocio (CCSS y demás)" valor={pctTxt(totalPatronal)}
            nota="Cuota patronal, sin el INS." color="text-indigo-700" />
          <Resumen titulo="Paga el negocio, con el INS" valor={pctTxt(conIns)}
            nota="Lo que de verdad cuesta cada colón de salario." color="text-indigo-900" />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-500">Año de estas tasas</label>
          <input value={t.vigente} onChange={e => set('vigente', e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-28" />
          <p className="text-[11px] text-gray-400 mt-0.5">
            Solo es una etiqueta para saber de qué año son los números que están puestos.
          </p>
        </div>

        {/* CUOTA OBRERA */}
        <Seccion titulo="Cuota obrera — lo que se le rebaja del salario"
          nota="Cada renglón aparece por separado en el comprobante de pago. «Se le rebajó ₡54.150» no se
                puede explicar; «SEM ₡27.500, IVM ₡21.650, Banco Popular ₡5.000» sí.">
          <Rubros lista={t.obrero} onPct={(i, v) => setRubro('obrero', i, v)} total={totalObrero} />
        </Seccion>

        {/* CUOTA PATRONAL */}
        <Seccion titulo="Cuota patronal — lo que paga el negocio además del salario"
          nota="Esto NO se le rebaja al trabajador: se suma al costo del negocio.">
          <Rubros lista={t.patronal} onPct={(i, v) => setRubro('patronal', i, v)} total={totalPatronal} />
        </Seccion>

        {/* INS */}
        <Seccion titulo="INS — Riesgos del trabajo"
          nota="Va aparte de la cuota patronal a propósito: es una PÓLIZA del INS, no una carga de la CCSS,
                y su tarifa depende de la actividad del negocio.">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={t.ins.activo}
                onChange={e => set('ins', { ...t.ins, activo: e.target.checked })}
                className="w-4 h-4" />
              Incluir el INS en el costo
            </label>
            <div>
              <label className="block text-[11px] font-bold text-gray-500">Tarifa de la póliza</label>
              <div className="flex items-center gap-1">
                <input type="number" step="0.01" min="0" max="100" value={t.ins.pct}
                  disabled={!t.ins.activo}
                  onChange={e => set('ins', { ...t.ins, pct: Number(e.target.value) || 0 })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24 text-right tabular-nums disabled:bg-gray-100" />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 flex items-start gap-2">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <span>{t.ins.nota}</span>
          </p>
        </Seccion>

        {/* IMPUESTO SOBRE LA RENTA */}
        <Seccion titulo="Impuesto sobre la renta del salario"
          nota="Se aplica solo al EXCESO de cada tramo, no a todo el salario.">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
            <input type="checkbox" checked={t.renta.activo}
              onChange={e => set('renta', { ...t.renta, activo: e.target.checked })}
              className="w-4 h-4" />
            Retener el impuesto en la planilla
          </label>

          {t.renta.activo && (
            <div className="space-y-3">
              <TramosRenta tramos={t.renta.tramos}
                onCambio={tr => set('renta', { ...t.renta, tramos: tr })} />

              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500">Crédito por cada hijo (al mes)</label>
                  <input type="number" min="0" value={t.renta.credito_hijo}
                    onChange={e => set('renta', { ...t.renta, credito_hijo: Number(e.target.value) || 0 })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-32 text-right tabular-nums" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500">Crédito por cónyuge (al mes)</label>
                  <input type="number" min="0" value={t.renta.credito_conyuge}
                    onChange={e => set('renta', { ...t.renta, credito_conyuge: Number(e.target.value) || 0 })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-32 text-right tabular-nums" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Los créditos se restan DEL IMPUESTO, no del salario, y nunca lo dejan negativo.
                Cuántos hijos declara cada persona se pone en su expediente.
              </p>

              {/* LA AMBIGÜEDAD, declarada */}
              <div className="border-2 border-sky-200 bg-sky-50 rounded-xl p-3">
                <p className="text-xs font-black text-sky-900 flex items-center gap-1.5 mb-2">
                  <Info size={13} /> ¿Sobre qué monto se calcula?
                </p>
                <div className="space-y-1.5">
                  {([['bruto', 'Sobre el salario bruto'],
                     ['bruto_menos_ccss', 'Sobre el bruto menos la cuota obrera de la CCSS']] as const).map(([v, l]) => (
                    <label key={v} className="flex items-start gap-2 text-xs text-gray-800">
                      <input type="radio" name="base_renta" checked={t.renta.base === v}
                        onChange={() => set('renta', { ...t.renta, base: v })}
                        className="mt-0.5" />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-sky-900 mt-2 leading-snug">
                  Las fuentes se contradicen en este punto: unas dicen que la base es el bruto citando el
                  decreto vigente, y otras que la cuota obrera se resta primero. Cambia el impuesto de
                  salarios cercanos al tramo exento. Preguntale a tu contador cuál usa, y ponela acá.
                </p>
              </div>
            </div>
          )}
        </Seccion>

        {/* BASE MÍNIMA CONTRIBUTIVA */}
        <Seccion titulo="Base mínima contributiva de la CCSS"
          nota="El piso sobre el que la CCSS cobra, aunque el salario sea menor.">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
            <input type="checkbox" checked={t.bmc.aplicar}
              onChange={e => set('bmc', { ...t.bmc, aplicar: e.target.checked })}
              className="w-4 h-4" />
            Calcular las cuotas sobre el piso cuando el salario sea menor
          </label>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500">Piso del SEM</label>
              <input type="number" min="0" value={t.bmc.sem}
                onChange={e => set('bmc', { ...t.bmc, sem: Number(e.target.value) || 0 })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-36 text-right tabular-nums" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500">Piso del IVM</label>
              <input type="number" min="0" value={t.bmc.ivm}
                onChange={e => set('bmc', { ...t.bmc, ivm: Number(e.target.value) || 0 })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-36 text-right tabular-nums" />
            </div>
          </div>
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-2 leading-snug">
            {t.bmc.nota}
          </p>
          {!t.bmc.aplicar && (
            <p className="text-[11px] text-gray-500 mt-1.5">
              Con el ajuste apagado, la planilla igual <b>avisa</b> cuando alguien gana menos que el piso:
              así se ve a quién afectaría antes de activarlo.
            </p>
          )}
        </Seccion>
      </div>

      {/* ACCIONES */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 flex flex-wrap gap-2 rounded-b-2xl">
        <button onClick={() => void guardar()} disabled={guardando}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:bg-gray-300">
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar tasas
        </button>
        {omision && (
          <button onClick={() => { setT(omision); setAviso('Se cargaron las tasas de fábrica. Todavía no se guardaron.'); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600">
            <RotateCcw size={13} /> Volver a las de {omision.vigente}
          </button>
        )}
        <button onClick={onCerrar}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 ml-auto">
          Cerrar
        </button>
      </div>
    </Marco>
  );
};

const Marco: React.FC<{ children: React.ReactNode; onCerrar: () => void }> = ({ children, onCerrar }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
    onClick={onCerrar}>
    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl my-auto" onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-4 sm:px-6 py-4 flex items-start justify-between z-10">
        <div>
          <h2 className="text-lg font-black text-gray-900">Tasas de la planilla</h2>
          <p className="text-xs text-gray-500">
            CCSS, INS, impuesto sobre la renta y base mínima contributiva.
          </p>
        </div>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>
);

const Resumen: React.FC<{ titulo: string; valor: string; nota: string; color: string }> =
  ({ titulo, valor, nota, color }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3">
    <p className="text-[11px] font-bold text-gray-500 leading-snug">{titulo}</p>
    <p className={`text-2xl font-black tabular-nums ${color}`}>{valor}</p>
    <p className="text-[10px] text-gray-400 leading-snug">{nota}</p>
  </div>
);

const Seccion: React.FC<{ titulo: string; nota: string; children: React.ReactNode }> =
  ({ titulo, nota, children }) => (
  <section className="border-t border-gray-100 pt-4">
    <h3 className="text-sm font-black text-gray-900">{titulo}</h3>
    <p className="text-[11px] text-gray-400 leading-snug mb-3 max-w-2xl">{nota}</p>
    {children}
  </section>
);

const Rubros: React.FC<{
  lista: TasaConfig[]; onPct: (i: number, v: string) => void; total: number;
}> = ({ lista, onPct, total }) => (
  <div className="border border-gray-200 rounded-xl overflow-hidden">
    {lista.map((r, i) => (
      <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800 truncate">{r.label}</p>
          {r.nota && <p className="text-[10px] text-gray-400 leading-snug">{r.nota}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <input type="number" step="0.01" min="0" max="100" value={r.pct}
            onChange={e => onPct(i, e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20 text-right tabular-nums" />
          <span className="text-xs text-gray-500 w-3">%</span>
        </div>
      </div>
    ))}
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 font-black text-sm">
      <span>Total</span>
      <span className="tabular-nums">{pctTxt(total)}</span>
    </div>
  </div>
);

/**
 * LOS TRAMOS DEL IMPUESTO.
 *
 * Cada tramo empieza donde termina el anterior: eso no se edita, se deriva.
 * Dejar los dos extremos editables es la forma más fácil de armar una tabla
 * con un hueco, y un salario que cae en el hueco no paga impuesto sin que
 * nadie se dé cuenta. Acá se edita el TOPE de cada tramo y su porcentaje.
 */
const TramosRenta: React.FC<{
  tramos: Array<{ desde: number; hasta: number | null; pct: number }>;
  onCambio: (t: Array<{ desde: number; hasta: number | null; pct: number }>) => void;
}> = ({ tramos, onCambio }) => {
  const recoser = (lista: Array<{ desde: number; hasta: number | null; pct: number }>) =>
    lista.map((t, i) => ({
      ...t,
      desde: i === 0 ? 0 : Number(lista[i - 1].hasta) || 0,
      hasta: i === lista.length - 1 ? null : t.hasta,
    }));

  const setTope = (i: number, v: string) => {
    const copia = [...tramos];
    copia[i] = { ...copia[i], hasta: v === '' ? null : Number(v) || 0 };
    onCambio(recoser(copia));
  };
  const setPct = (i: number, v: string) => {
    const copia = [...tramos];
    copia[i] = { ...copia[i], pct: Number(v) || 0 };
    onCambio(copia);
  };
  const agregar = () => {
    const ult = tramos[tramos.length - 1];
    const copia = [...tramos];
    /* El nuevo tramo se mete ANTES del último, que es el abierto: el abierto
       siempre tiene que quedar al final o un salario alto no paga nada. */
    copia.splice(tramos.length - 1, 0, {
      desde: 0, hasta: Number(ult.desde) + 1_000_000, pct: Number(ult.pct),
    });
    onCambio(recoser(copia));
  };
  const quitar = (i: number) => {
    if (tramos.length <= 2) return;
    onCambio(recoser(tramos.filter((_, j) => j !== i)));
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 bg-gray-50 text-[10px] uppercase font-bold text-gray-500">
        <span>Tramo mensual</span><span className="text-right">Tarifa</span><span></span>
      </div>
      {tramos.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 border-b border-gray-50 last:border-0">
          <div className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0">
            <span className="tabular-nums text-gray-400 shrink-0">{crc(t.desde)}</span>
            <span className="text-gray-300 shrink-0">a</span>
            {t.hasta == null ? (
              <span className="text-xs font-bold text-gray-500">en adelante</span>
            ) : (
              <input type="number" min="0" value={t.hasta}
                onChange={e => setTope(i, e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-32 text-right tabular-nums" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <input type="number" step="0.01" min="0" max="100" value={t.pct}
              onChange={e => setPct(i, e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20 text-right tabular-nums" />
            <span className="text-xs text-gray-500">%</span>
          </div>
          {tramos.length > 2 && i < tramos.length - 1 ? (
            <button onClick={() => quitar(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
          ) : <span className="w-[13px]" />}
        </div>
      ))}
      <button onClick={agregar}
        className="w-full px-3 py-2 text-left text-xs font-bold text-indigo-600 hover:bg-gray-50 flex items-center gap-1">
        <Plus size={12} /> Agregar un tramo
      </button>
      <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-50 leading-snug">
        El inicio de cada tramo se deriva del tope del anterior: así la tabla no puede quedar con un
        hueco donde un salario no pagaría nada. El último siempre queda abierto.
      </p>
    </div>
  );
};

export default PayrollSettings;
