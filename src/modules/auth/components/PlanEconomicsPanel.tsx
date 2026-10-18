'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Send, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb, Pencil } from 'lucide-react';
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

/**
 * PRECIO DE COSTO CONTRA PRECIO DE VENTA, por plan.
 *
 * Dos columnas de costo a propósito, no una. La factura de Supabase es UNA y
 * no viene desglosada por negocio, así que cualquier «costo por plan» es un
 * reparto, no un hecho. Se muestran los dos repartos razonables —por partes
 * iguales y por peso real en la base— y cuando no coinciden, eso es
 * justamente lo que hay que mirar: un plan barato que pesa mucho.
 *
 * Un solo número habría escondido ese caso, que es el único por el que vale
 * la pena abrir esta pantalla.
 */

const crc = (n: number | null | undefined) =>
  n == null ? '—' : `₡${Math.round(n).toLocaleString('es-CR')}`;

export const PlanEconomicsPanel: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [publicando, setPublicando] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    void (async () => {
      try { setD(await apiFetch<any>('/admin/planes-costos', {}, 120000)); }
      catch (e) { setError(explicarFallo(e)); }
    })();
  }, []);

  const declarar = async (plan: any) => {
    const actual = plan.ingreso_declarado ?? '';
    const txt = prompt(
      `¿Cuánto deja «${plan.nombre}» por negocio y por mes?\n\n`
      + 'Es para los planes que se cobran por fuera del sistema (vitalicios, bolsas de facturas, '
      + 'arreglos aparte). Poné 0 para volver al precio configurado del plan.',
      String(actual));
    if (txt === null) return;
    const monto = Number(String(txt).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(monto)) { setError('Escribí un número.'); return; }
    try {
      await apiFetch('/admin/planes-costos/ingreso', {
        method: 'PUT', body: JSON.stringify({ plan_id: plan.id, monto }),
      });
      setD(await apiFetch<any>('/admin/planes-costos?refresh=1', {}, 120000));
      setAviso(monto > 0
        ? `«${plan.nombre}» queda en ${crc(monto)} por negocio al mes.`
        : `«${plan.nombre}» vuelve a tomar el precio configurado del plan.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  const publicar = async (plan: any) => {
    setPublicando(plan.id); setAviso(''); setError('');
    try {
      const r = await apiFetch<any>('/admin/planes-costos/publicar', {
        method: 'POST', body: JSON.stringify({ plan_id: plan.id }),
      });
      setAviso(`«${plan.nombre}» ${r.actualizado ? 'se actualizó' : 'se agregó'} en el borrador de la `
        + 'página pública, con sus módulos reales. Revisalo en «Página pública» y publicá desde ahí.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar');
    } finally { setPublicando(null); }
  };

  if (error && !d) return <p className="text-sm text-red-600 font-semibold">{error}</p>;
  if (!d) return (
    <p className="text-sm text-gray-500 flex items-center gap-2">
      <Loader2 size={14} className="animate-spin" /> Calculando costo y venta por plan…
    </p>
  );

  const inf = d.infraestructura;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-600" /> Planes: lo que cuestan y lo que dejan
        </h3>
        <p className="text-sm text-gray-500">
          <b>{d.negocios_activos} negocios que pagan y usan</b> el sistema ·{' '}
          {d.facturas_totales.toLocaleString('es-CR')} facturas emitidas
          {(d.resumen_apartados?.morosos > 0 || d.resumen_apartados?.inactivos > 0) && (
            <span className="text-amber-700 font-semibold">
              {' '}· {d.resumen_apartados.morosos} morosos y {d.resumen_apartados.inactivos} inactivos
              {' '}quedaron fuera del cálculo
            </span>
          )}
        </p>
      </div>

      {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500">Entra al mes</p>
          <p className="text-2xl font-black text-emerald-700 tabular-nums">{crc(d.ingreso_mensual_total)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Suma de las suscripciones activas, llevadas a un mes.</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500">Cuesta la infraestructura</p>
          <p className="text-2xl font-black text-gray-900 tabular-nums">
            US${inf.costo_usd_hoy}
            {inf.costo_crc_hoy != null && <span className="text-sm text-gray-400"> · {crc(inf.costo_crc_hoy)}</span>}
          </p>
          {/* El desglose. «US$56» sin decir de dónde sale no se puede
              verificar, y es el número que manda en todo el cálculo. */}
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">
            {inf.desglose?.facturacion_electronica_usd > 0 && (
              <>Facturación electrónica US${inf.desglose.facturacion_electronica_usd}
                {inf.desglose.servidores_usd > 0
                  ? ` + servidores US$${inf.desglose.servidores_usd}`
                  : ' · servidores ₡0 (plan gratuito)'}
                <br /></>
            )}
            {inf.fe && (
              <span className={inf.fe.libres <= 150 ? 'text-amber-700 font-bold' : ''}>
                {inf.fe.usados} de {inf.fe.incluidos} documentos usados
                {inf.fe.pasados > 0
                  ? ` · ${inf.fe.pasados} de más a ₡${inf.fe.extra_crc} c/u`
                  : ` · quedan ${inf.fe.libres}`}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500">Si tuvieras que pagar</p>
          <p className="text-2xl font-black text-gray-900 tabular-nums">US${inf.costo_usd_si_pagaras}</p>
          <p className="text-[11px] text-gray-400 mt-1">Supabase Pro + Vercel Pro, por mes.</p>
        </div>
      </div>

      {/* El hueco declarado. Va arriba de la tabla para que nadie lea esos
          márgenes como si fueran la contabilidad. */}
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        <b>El costo de acá es un piso, no la factura.</b> {inf.nota}
        {d.tipo_cambio == null && ' Tampoco hay un tipo de cambio guardado, así que lo que se puede, se muestra en dólares.'}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2 font-bold">Plan</th>
              <th className="text-right px-3 py-2 font-bold">Precio de venta</th>
              <th className="text-right px-3 py-2 font-bold">Negocios</th>
              <th className="text-right px-3 py-2 font-bold" title="Facturas por negocio en los últimos 30 días: lo que de verdad cuesta atenderlo">Uso real</th>
              <th className="text-right px-3 py-2 font-bold">Entra al mes</th>
              <th className="text-right px-3 py-2 font-bold" title="Qué parte de las facturas DEL ÚLTIMO MES emite este plan">Peso</th>
              <th className="text-right px-3 py-2 font-bold" title="Repartiendo la factura según cuánto pesa cada plan">Costo</th>
              <th className="text-right px-3 py-2 font-bold">Queda</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {d.planes.map((p: any) => {
              const gratis = p.precio_mensual <= 0;
              return (
                <tr key={p.id} className={gratis ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-2">
                    <span className="font-bold text-gray-800">{p.nombre}</span>
                    <span className="block text-[10px] text-gray-400 truncate max-w-[220px]" title={p.nombres.join(', ')}>
                      {p.nombres.join(', ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.precio > 0 ? crc(p.precio) : <span className="text-amber-700 font-bold">₡0</span>}
                    <span className="block text-[10px] text-gray-400">{p.ciclo}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{p.negocios}</td>
                  {/* USO REAL: facturas por negocio en el último mes.
                      Es la columna que cambia la lectura de toda la tabla. Un
                      plan de ₡0 con 15 facturas al mes no es un lastre: no
                      cuesta nada atenderlo. El que pesa puede ser uno que
                      cobra bien y emite cientos. */}
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {p.facturas_por_negocio_mes}
                    <span className="block text-[10px] text-gray-400">fact./mes c/u</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">
                    {crc(p.ingreso_mensual)}
                    {p.ingreso_declarado != null && (
                      <span className="block text-[10px] font-semibold text-indigo-500" title="Lo declaraste vos, no sale del precio del plan">
                        declarado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{p.peso_pct}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {/* En colones si hay tipo de cambio; si no, en dólares.
                        Un «—» daba a entender que el costo no se sabe, y sí
                        se sabe: lo que falta es la conversión. */}
                    {p.costo_por_peso != null
                      ? crc(p.costo_por_peso)
                      : `US$${Number(p.costo_por_peso_usd ?? 0).toFixed(2)}`}
                    {p.costo_parejo != null && p.costo_por_peso != null
                      && Math.abs(p.costo_parejo - p.costo_por_peso) > 1 && (
                      <span className="block text-[10px] text-gray-400" title="Repartiendo la factura por partes iguales entre negocios">
                        parejo {crc(p.costo_parejo)}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${
                    (p.margen ?? 0) > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {crc(p.margen)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/* Declarar lo que el plan deja de verdad.
                        El sistema solo conoce `subscription_plans.price`, y un
                        vitalicio en ₡0 puede estar cobrándose por fuera. Sin
                        esto, planes que SÍ dejan plata salían como lastre. */}
                    <button onClick={() => void declarar(p)}
                      title="Decir cuánto deja por negocio y por mes (para los que se cobran por fuera)"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 mr-3">
                      <Pencil size={11} /> Ingreso
                    </button>
                    <button onClick={() => void publicar(p)} disabled={publicando === p.id}
                      title="Agregarlo a la página pública con su precio y sus módulos reales"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 disabled:text-gray-300">
                      {publicando === p.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Publicar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* LOS QUE QUEDARON FUERA.
          No se esconden: se apartan y se listan, separados por motivo, porque
          un moroso y un inactivo se atienden distinto. El moroso usa el
          sistema y no pagó —hay que ir a cobrar—; el inactivo paga o no, pero
          dejó de usarlo, y esa es una baja que todavía no avisó. */}
      {(d.apartados ?? []).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {([['moroso', 'Morosos · hay que ir a cobrar', 'rose'],
             ['inactivo', `Inactivos · más de ${d.resumen_apartados.dias_para_inactivo} días sin facturar`, 'gray']] as const)
            .map(([motivo, titulo, color]) => {
            const filas = d.apartados.filter((a: any) => a.motivo === motivo);
            if (filas.length === 0) return null;
            const borde = color === 'rose' ? 'border-rose-200 bg-rose-50' : 'border-gray-200 bg-gray-50';
            const texto = color === 'rose' ? 'text-rose-900' : 'text-gray-700';
            return (
              <div key={motivo} className={`rounded-xl border p-4 ${borde}`}>
                <p className={`font-black text-sm ${texto}`}>{titulo} ({filas.length})</p>
                <div className="mt-2 space-y-1">
                  {filas.map((a: any) => (
                    <div key={a.tenant_id + a.plan} className="flex justify-between gap-3 text-xs py-1 border-b border-black/5 last:border-0">
                      <span className={`font-semibold truncate ${texto}`} title={a.plan}>{a.negocio}</span>
                      <span className="text-gray-500 tabular-nums shrink-0">
                        {a.vence && motivo === 'moroso' ? `venció ${a.vence}` : ''}
                        {a.dias_sin_facturar === null
                          ? ' · nunca facturó'
                          : motivo === 'inactivo' ? ` ${a.dias_sin_facturar} días` : ''}
                        {/* Un moroso que factura mucho es el que más urge:
                            está usando el sistema todos los días sin pagar. */}
                        {motivo === 'moroso' && a.facturas > 0 ? ` · ${a.facturas.toLocaleString('es-CR')} facturas` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lo que cuesta mirar y es lo que más sirve. */}
      {d.planes_sin_ingreso.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-black text-amber-900 flex items-center gap-2 text-sm">
            <AlertTriangle size={15} /> Negocios que no generan ingreso
          </p>
          <p className="text-xs text-amber-800 mt-1 mb-2">
            Según el sistema no dejan nada. Mirá la columna de uso antes de sacar conclusiones:
            un plan con quince facturas al mes por negocio casi no cuesta atenderlo, y si lo
            estás cobrando por fuera, tocá «Ingreso» en la tabla y declaralo.
          </p>
          {d.planes_sin_ingreso.map((p: any) => (
            <div key={p.nombre} className="flex justify-between text-sm py-1 border-b border-amber-100 last:border-0">
              <span className="text-amber-900 font-semibold">{p.nombre}</span>
              <span className="text-amber-800 tabular-nums">
                {p.negocios} negocio(s) · <b>{p.facturas_por_negocio_mes} facturas/mes cada uno</b>
                {' '}· {p.peso_pct}% del peso
              </span>
            </div>
          ))}
        </div>
      )}

      {/* IDEAS DE PLANES.
          Cada una nace de un número medido más arriba y lo dice. Sin el dato
          detrás sería una opinión sobre precios, y de esas ya hay de sobra;
          lo que falta es saber qué está pasando. Ninguna trae precio: el
          costo por negocio son centavos, así que el precio lo define el
          mercado, no esta pantalla. */}
      {(d.propuestas ?? []).length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="font-black text-indigo-900 flex items-center gap-2 text-sm">
            <Lightbulb size={15} /> Planes que convendría tener
          </p>
          <p className="text-xs text-indigo-700 mt-1 mb-3">
            Salen de lo que pasa en tus datos, no de una plantilla. Son para decidir: el precio
            lo ponés vos, que conocés el mercado.
          </p>
          <div className="space-y-2">
            {d.propuestas.map((p: any) => (
              <div key={p.nombre} className="bg-white rounded-lg border border-indigo-100 p-3">
                <p className="font-bold text-sm text-gray-900">{p.nombre}</p>
                <p className="text-xs text-gray-700 mt-1 leading-relaxed">{p.idea}</p>
                <p className="text-[11px] text-indigo-700 mt-1.5">
                  <b>Por qué:</b> {p.porque}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5"><b>Para:</b> {p.a_quien}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
        <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
        «Publicar» agrega el plan al BORRADOR de la página pública, con los módulos que tiene
        configurados hoy. No cambia lo que ve internet hasta que lo publiques desde «Página pública».
      </p>
    </div>
  );
};

export default PlanEconomicsPanel;
