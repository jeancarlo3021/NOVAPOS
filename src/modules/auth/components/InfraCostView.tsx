'use client';

import React, { useEffect, useState } from 'react';
import { Server, HardDrive, Users2, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Database } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * «NetworkError when attempting to fetch resource» no le dice nada a nadie.
 *
 * Es lo que muestra el navegador cuando la petición se cortó, y en esta
 * pantalla la causa casi siempre es la misma: medir toda la base tarda, y la
 * función del servidor se corta a los 30 segundos. Decirlo con todas las
 * letras ahorra que alguien se vaya a revisar su conexión.
 */
const explicarFallo = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  if (/networkerror|failed to fetch|load failed|aborted|timeout/i.test(m)) {
    return 'La medición tardó más de lo que el servidor permite (30 segundos) y se cortó. '
      + 'Suele pasar en la primera carga del día, cuando el servidor viene "frío". '
      + 'Esperá unos segundos y tocá «Volver a medir».';
  }
  return m;
};
import { PlanEconomicsPanel } from './PlanEconomicsPanel';

/**
 * COSTOS DE INFRAESTRUCTURA: Supabase y Vercel.
 *
 * La regla de esta pantalla es que cada número diga DE DÓNDE SALE. Un panel de
 * costos que mezcla lo medido con lo supuesto no se puede usar para decidir:
 * la primera vez que un número no cuadra, se deja de creer en todos. Por eso
 * lo que no se puede medir aparece como «no se puede medir» y dice qué haría
 * falta, en vez de rellenarse con una estimación disfrazada de dato.
 */

const MB = 1048576;
const GB = 1073741824;
const peso = (b: number | null | undefined) =>
  b == null ? '—' : b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`;

/**
 * Los límites de cada plan, con la fecha en que se consultaron.
 *
 * Van acá y no en el servidor porque son datos de afuera que cambian sin
 * avisarnos: dejarlos a la vista, fechados, es lo que permite darse cuenta de
 * que están viejos. Un límite desactualizado da una tranquilidad falsa.
 */
const PLANES = {
  consultado: 'octubre 2026',
  supabase: {
    free: { nombre: 'Free', precio: 0, base: 500 * MB, archivos: GB, mau: 50_000, egreso: 5 * GB },
    pro: { nombre: 'Pro', precio: 25, base: 8 * GB, archivos: 100 * GB, mau: 100_000, egreso: 250 * GB },
    extra: { base: 0.125, archivos: 0.021, egreso: 0.09, mau: 0.00325 },
  },
  vercel: {
    hobby: { nombre: 'Hobby', precio: 0, nota: 'No permite uso comercial.' },
    pro: { nombre: 'Pro', precio: 20, nota: 'Por miembro del equipo, por mes.' },
  },
};

interface Medida { origen: 'medido' | 'estimado' | 'no_medible'; valor: number | null; nota?: string }

const SELLO: Record<string, { texto: string; clase: string }> = {
  medido: { texto: 'medido', clase: 'bg-emerald-100 text-emerald-700' },
  estimado: { texto: 'estimado', clase: 'bg-amber-100 text-amber-700' },
  no_medible: { texto: 'no se puede medir', clase: 'bg-gray-200 text-gray-600' },
};
const Sello: React.FC<{ origen: string }> = ({ origen }) => {
  const s = SELLO[origen] ?? SELLO.estimado;
  return <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${s.clase}`}>{s.texto}</span>;
};

/** Una barra con su límite. El color avisa antes de que duela. */
const Barra: React.FC<{ usado: number | null; tope: number }> = ({ usado, tope }) => {
  if (usado == null) return <div className="h-1.5 rounded-full bg-gray-100" />;
  const pct = Math.min(100, (usado / tope) * 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(1.5, pct)}%` }} />
    </div>
  );
};

export const InfraCostView: React.FC = () => {
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = async (refrescar = false) => {
    setCargando(true); setError('');
    try {
      setDatos(await apiFetch<any>(`/admin/infra-usage${refrescar ? '?refresh=1' : ''}`, {}, 120000));
    } catch (e) {
      setError(explicarFallo(e));
    } finally { setCargando(false); }
  };
  useEffect(() => { void cargar(); }, []);

  if (cargando && !datos) {
    return (
      <p className="text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Midiendo la base, los archivos y los usuarios…
      </p>
    );
  }
  if (error && !datos) return <p className="text-sm text-red-600 font-semibold">{error}</p>;
  if (!datos) return null;

  const sb = datos.supabase;
  const free = PLANES.supabase.free;
  const baseB = sb.base_bytes?.valor ?? 0;
  const archB = sb.archivos_bytes?.valor ?? 0;
  const mau = sb.mau_30d?.valor ?? 0;

  /**
   * ¿Alcanza el plan gratis?
   *
   * Se mira cada límite por separado porque basta con pasarse de UNO para
   * tener que pagar el plan entero: no es un promedio, es el peor de los tres.
   */
  const excedidos = [
    baseB > free.base && 'tamaño de la base',
    archB > free.archivos && 'archivos',
    mau > free.mau && 'usuarios activos',
  ].filter(Boolean) as string[];

  const Fila: React.FC<{ icono: React.ReactNode; titulo: string; usado: number | null; tope: number;
    medida: Medida; formato: (n: number | null) => string }> =
    ({ icono, titulo, usado, tope, medida, formato }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-800">{icono}{titulo}</span>
        <Sello origen={medida.origen} />
      </div>
      <p className="text-xl font-black text-gray-900 tabular-nums">
        {formato(usado)}
        <span className="text-xs font-bold text-gray-400"> / {formato(tope)}</span>
        {usado != null && (
          <span className="text-xs font-bold text-gray-500 ml-2">
            {((usado / tope) * 100).toFixed(1)}%
          </span>
        )}
      </p>
      <div className="mt-2"><Barra usado={usado} tope={tope} /></div>
      {medida.nota && <p className="text-[11px] text-gray-500 mt-2 leading-snug">{medida.nota}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-gray-900">Costos de infraestructura</h2>
          <p className="text-sm text-gray-500">
            Medido el {new Date(datos.medido_en).toLocaleString('es-CR')}
            {datos.desde_cache && ' · guardado (se remide cada 10 minutos)'}
          </p>
        </div>
        <button onClick={() => void cargar(true)} disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:bg-gray-300">
          {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Volver a medir
        </button>
      </div>

      {/* Veredicto arriba: es lo único que alguien necesita la mayoría de las veces. */}
      <div className={`rounded-2xl p-5 border-2 ${excedidos.length === 0
        ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          {excedidos.length === 0
            ? <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
            : <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />}
          <div>
            <p className="font-black text-gray-900">
              {excedidos.length === 0
                ? 'Supabase cabe en el plan gratuito'
                : `Supabase se pasa del plan gratuito en: ${excedidos.join(', ')}`}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              {excedidos.length === 0
                ? `De lo que se puede medir, lo más ajustado va al ${Math.max(
                    (baseB / free.base) * 100, (archB / free.archivos) * 100, (mau / free.mau) * 100,
                  ).toFixed(1)}% de su límite. El costo de Supabase hoy sería $0/mes.`
                : `Pasar al plan Pro cuesta $${PLANES.supabase.pro.precio}/mes e incluye mucho más margen.`}
            </p>
            {/* El hueco honesto: lo que no vemos es justo lo que más sorprende. */}
            <p className="text-xs text-gray-600 mt-2 bg-white/70 rounded-lg px-3 py-2">
              <b>Falta un dato, y es el que más sorprende en la factura:</b> el egreso (los GB que
              salen de Supabase). No lo expone la API de datos, solo el tablero de Supabase. El plan
              gratuito incluye {peso(free.egreso)} al mes.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Fila icono={<Database size={15} className="text-gray-400" />} titulo="Base de datos"
          usado={baseB} tope={free.base} medida={sb.base_bytes} formato={peso} />
        <Fila icono={<HardDrive size={15} className="text-gray-400" />} titulo="Archivos"
          usado={archB} tope={free.archivos} medida={sb.archivos_bytes} formato={peso} />
        <Fila icono={<Users2 size={15} className="text-gray-400" />} titulo="Usuarios activos (30 d)"
          usado={mau} tope={free.mau} medida={sb.mau_30d} formato={(n) => (n ?? 0).toLocaleString('es-CR')} />
      </div>

      {/* Vercel */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <Server size={15} className="text-gray-400" /> Vercel
          </span>
          <Sello origen={datos.vercel?.disponible ? 'medido' : 'no_medible'} />
        </div>
        {datos.vercel?.disponible ? (
          <p className="text-sm text-gray-700">Cuenta conectada: <b>{datos.vercel.cuenta}</b>.</p>
        ) : (
          <>
            <p className="text-sm text-gray-700">{datos.vercel?.motivo}</p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Para medirlo: crear un token en <b>vercel.com → Settings → Tokens</b> y ponerlo en el
              servidor como <code className="bg-gray-100 px-1 rounded">VERCEL_TOKEN</code> (y
              <code className="bg-gray-100 px-1 rounded ml-1">VERCEL_TEAM_ID</code> si el proyecto
              está en un equipo). Mientras tanto, el dato está en el tablero de Vercel.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Planes: <b>Hobby $0</b> — {PLANES.vercel.hobby.nota} · <b>Pro ${PLANES.vercel.pro.precio}</b> — {PLANES.vercel.pro.nota}
            </p>
          </>
        )}
      </div>

      {/* Dónde está el peso: lo que de verdad sirve para decidir qué podar. */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900">Dónde está el peso</h3>
          <span className="text-xs text-gray-500">{sb.filas_totales?.toLocaleString('es-CR')} filas en total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2 font-bold">Tabla</th>
              <th className="text-right px-4 py-2 font-bold">Filas</th>
              <th className="text-right px-4 py-2 font-bold">Por fila</th>
              <th className="text-right px-4 py-2 font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(sb.tablas ?? []).slice(0, 15).map((t: any) => (
              <tr key={t.tabla}>
                <td className="px-4 py-1.5 font-mono text-xs text-gray-700">{t.tabla}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-gray-600">{t.filas.toLocaleString('es-CR')}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-gray-400 text-xs">
                  {t.bytes_fila ? `${t.bytes_fila} B` : '—'}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums font-bold text-gray-800">{peso(t.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-[11px] text-gray-500">
            Los archivos de cada bucket:{' '}
            {(sb.buckets ?? []).filter((b: any) => b.objetos > 0)
              .map((b: any) => `${b.bucket} ${peso(b.bytes)}`).join(' · ')}
          </p>
        </div>
      </div>

      {/* Lo que cuesta contra lo que entra. Va acá, debajo del consumo, porque
          es la misma pregunta vista desde el otro lado: de qué sirve saber que
          la infraestructura cuesta X si no se ve contra cuánto entra. */}
      {/* Se monta DESPUÉS de que la medición terminó, no a la vez.
          Las dos consultas usan la misma medición de infraestructura: si
          salen juntas, las dos la calculan desde cero y compiten contra el
          límite de 30 segundos de la función. En fila, la segunda la
          encuentra ya hecha y tarda un segundo. */}
      <div className="pt-2 border-t border-gray-200">
        <PlanEconomicsPanel />
      </div>

      <p className="text-[11px] text-gray-400">
        Límites y precios consultados en {PLANES.consultado}. Las plataformas los cambian sin avisar:
        si algo acá no cuadra con la factura, mandá el número real y lo corregimos.
      </p>
    </div>
  );
};

export default InfraCostView;
