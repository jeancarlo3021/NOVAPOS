'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Send, Loader2, ThumbsUp, ThumbsDown, HelpCircle, Target } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * CHAT PARA PENSAR UN PLAN ANTES DE SACARLO.
 *
 * Se escribe en español —«un plan de ₡8.000 con inventario y facturación»— y
 * contesta qué tiene de bueno, qué de malo y qué no se puede saber.
 *
 * ── Por qué muestra «lo que no puedo saber» ───────────────────────────────
 * Porque un análisis que solo trae conclusiones se lee como si lo supiera
 * todo, y este no sabe cuánto soporte va a pedir cada cliente ni cuántos
 * clientes nuevos entrarían. Dejar ese hueco a la vista es lo que permite
 * usarlo para decidir sin creerle de más.
 */

interface Turno {
  pregunta: string;
  analisis?: any;
  error?: string;
}

const EJEMPLOS = [
  'Un plan de ₡8.000 con inventario y facturación electrónica',
  'Un plan de ₡5.000 solo para facturar',
  'Plan anual de ₡150.000 completo',
  'Un plan de ₡30.000 con multi-sucursal y planilla',
];

export const AnalizarPlanChat: React.FC = () => {
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turnos, cargando]);

  const preguntar = async (q: string) => {
    const pregunta = q.trim();
    if (!pregunta || cargando) return;
    setCargando(true); setTexto('');
    try {
      const r = await apiFetch<any>('/admin/analizar-plan', {
        method: 'POST', body: JSON.stringify({ mensaje: pregunta }),
      }, 120000);
      setTurnos(t => [...t, { pregunta, analisis: r?.datos ?? r }]);
    } catch (e) {
      setTurnos(t => [...t, { pregunta, error: e instanceof Error ? e.message : 'No se pudo analizar' }]);
    } finally { setCargando(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Calculator size={18} className="text-violet-600" /> Analizar un plan
        </h2>
        <p className="text-sm text-gray-500">
          Describí un plan que estés pensando y te digo qué tiene de bueno y qué de malo,
          con los números de tu negocio.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 min-h-[320px] max-h-[62vh] overflow-y-auto space-y-4">
        {turnos.length === 0 && !cargando && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Escribí el precio y qué incluiría. No hace falta que sea formal.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EJEMPLOS.map(e => (
                <button key={e} onClick={() => void preguntar(e)}
                  className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:border-violet-300 hover:bg-violet-50 text-left">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turnos.map((t, i) => (
          <div key={i} className="space-y-2">
            <p className="text-right">
              <span className="inline-block bg-violet-600 text-white text-sm font-semibold px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[85%] text-left">
                {t.pregunta}
              </span>
            </p>

            {t.error ? (
              <p className="text-sm text-red-600 font-semibold">{t.error}</p>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm p-3 space-y-3">
                {/* Qué entendió. Va primero: si leyó mal el precio, todo lo
                    que sigue sobra y conviene verlo de una. */}
                {t.analisis?.entendido?.precio != null && (
                  <p className="text-[11px] text-gray-500">
                    Entendí: <b className="text-gray-700">
                      ₡{Number(t.analisis.entendido.precio).toLocaleString('es-CR')} {t.analisis.entendido.ciclo}
                    </b>
                    {t.analisis.entendido.modulos?.length > 0 && (
                      <> · {t.analisis.entendido.modulos.join(', ')}</>
                    )}
                  </p>
                )}

                {/* ── LA CUENTA ──────────────────────────────────────────
                    Va antes que todo lo demás: «cuánto cuesta y cuánto queda»
                    es la pregunta. Estaba desparramada entre los puntos a
                    favor y en contra, donde se lee como un comentario más. */}
                {t.analisis?.economia && (
                  <div className="bg-white border-2 border-violet-200 rounded-xl p-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {([['Cobrás', t.analisis.economia.precio_mensual, 'text-gray-900'],
                         ['Te cuesta', t.analisis.economia.costo_por_cliente, 'text-rose-700'],
                         ['Aporta', t.analisis.economia.ganancia_por_cliente,
                           Number(t.analisis.economia.ganancia_por_cliente) >= 0
                             ? 'text-emerald-700' : 'text-red-600']] as const)
                        .map(([et, v, color]) => (
                        <div key={et}>
                          <p className="text-[10px] font-bold text-gray-500 uppercase">{et}</p>
                          <p className={`text-lg font-black tabular-nums ${color}`}>
                            ₡{Math.round(Number(v)).toLocaleString('es-CR')}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-center text-gray-500 mt-1">
                      por cliente, al mes · lo que aporta para cubrir los fijos
                      {t.analisis.economia.margen_pct != null && (
                        <> · margen del <b className="text-gray-700">{t.analisis.economia.margen_pct}%</b></>
                      )}
                    </p>

                    {/* De qué está hecho el costo. Un «₡166» sin decir de
                        dónde sale no se puede discutir ni verificar. */}
                    {t.analisis.economia.costo_detalle?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
                        {t.analisis.economia.costo_detalle.map((d: any, j: number) => (
                          <div key={j} className="flex justify-between gap-2 text-[11px]">
                            <span className="text-gray-600">{d.concepto}</span>
                            <span className="text-right">
                              <b className="tabular-nums text-gray-800">
                                ₡{Math.round(Number(d.monto)).toLocaleString('es-CR')}
                              </b>
                              {d.nota && <span className="block text-gray-400">{d.nota}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Los escenarios: el costo por cliente no es constante,
                        porque la bolsa de documentos se va llenando. Mirando
                        un cliente aislado ese salto no se ve. */}
                    {t.analisis.economia.escenarios?.length > 0 && (
                      <table className="w-full text-[11px] mt-2 pt-2 border-t border-gray-100">
                        <thead className="text-gray-400">
                          <tr>
                            <th className="text-left font-bold">Si conseguís</th>
                            <th className="text-right font-bold">Entra</th>
                            <th className="text-right font-bold">Cuesta</th>
                            <th className="text-right font-bold">Queda</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.analisis.economia.escenarios.map((x: any) => (
                            <tr key={x.clientes} className="border-t border-gray-50">
                              <td className="py-0.5 text-gray-700">
                                {x.clientes} clientes
                                {x.nota && <span className="block text-[10px] text-gray-400">{x.nota}</span>}
                              </td>
                              <td className="py-0.5 text-right tabular-nums text-gray-700">
                                ₡{Math.round(x.ingreso).toLocaleString('es-CR')}
                              </td>
                              <td className="py-0.5 text-right tabular-nums text-rose-700">
                                ₡{Math.round(x.costo).toLocaleString('es-CR')}
                              </td>
                              {/* En rojo si da negativo. Una pérdida pintada
                                  de verde se lee como ganancia y es justo el
                                  renglón que hay que ver. */}
                              <td className={`py-0.5 text-right tabular-nums font-bold ${
                                x.ganancia >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                ₡{Math.round(x.ganancia).toLocaleString('es-CR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {/* ── LOS COSTOS FIJOS ───────────────────────────────
                        Se pagan haya o no un cliente más, así que NO se
                        reparten entre los clientes: hacerlo daría un «costo
                        por cliente» que baja solo con crecer, y con eso
                        cualquier precio parece rentable. Van acá, con cuántos
                        clientes hacen falta para cubrirlos, que es la pregunta
                        que decide si el plan se sostiene. */}
                    {t.analisis.economia.fijos && (
                      <div className="mt-2 pt-2 border-t-2 border-gray-100">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-black text-gray-700 uppercase">
                            Costos fijos del mes
                          </span>
                          <span className="text-sm font-black tabular-nums text-gray-900">
                            US${t.analisis.economia.fijos.total_usd}
                            {t.analisis.economia.fijos.total_crc != null && (
                              <span className="text-gray-500 font-bold">
                                {' '}· ₡{Number(t.analisis.economia.fijos.total_crc).toLocaleString('es-CR')}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {t.analisis.economia.fijos.conceptos.map((c: any, j: number) => (
                            <div key={j} className="flex justify-between gap-2 text-[11px]">
                              <span className={c.usd > 0 ? 'text-gray-700' : 'text-gray-400'}>
                                {c.concepto}
                                <span className="block text-[10px] text-gray-400">{c.nota}</span>
                              </span>
                              <span className={`tabular-nums shrink-0 ${c.usd > 0 ? 'font-bold text-gray-800' : 'text-gray-400'}`}>
                                US${c.usd}
                              </span>
                            </div>
                          ))}
                        </div>
                        {t.analisis.economia.fijos.clientes_para_cubrirlos != null && (
                          <p className="mt-1.5 text-[11px] font-bold text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1.5">
                            Hacen falta <b>{t.analisis.economia.fijos.clientes_para_cubrirlos} clientes</b> de
                            este plan para pagar todos los costos fijos del mes. A partir de ahí, lo que
                            entre es ganancia.
                          </p>
                        )}
                        {t.analisis.economia.fijos.tipo_cambio != null && (
                          <p className="mt-1 text-[10px] text-gray-400">
                            Convertido a ₡{t.analisis.economia.fijos.tipo_cambio} por dólar —{' '}
                            {t.analisis.economia.fijos.tipo_cambio_fuente}.
                          </p>
                        )}
                      </div>
                    )}

                    {/* El caso que más engaña: por cliente da ganancia, pero
                        al crecer da pérdida porque la bolsa se llena. Sin
                        decirlo, alguien lanza el plan mirando el primer
                        número y se entera cuando ya tiene clientes. */}
                    {t.analisis.economia.ganancia_por_cliente > 0
                      && t.analisis.economia.escenarios?.some((x: any) => x.ganancia < 0) && (
                      <p className="mt-2 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                        <b>Ojo:</b> con un cliente deja plata, pero al crecer da pérdida. La bolsa de
                        documentos se llena y a partir de ahí cada factura se paga aparte.
                      </p>
                    )}
                  </div>
                )}

                {/* El veredicto: es lo único que mucha gente va a leer. */}
                {t.analisis?.veredicto && (
                  <p className="text-sm text-gray-900 font-semibold flex items-start gap-2">
                    <Target size={15} className="text-violet-600 mt-0.5 shrink-0" />
                    {t.analisis.veredicto}
                  </p>
                )}

                {(t.analisis?.bueno?.length > 0 || t.analisis?.malo?.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {t.analisis.bueno?.length > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        <p className="text-xs font-black text-emerald-800 flex items-center gap-1.5 mb-1">
                          <ThumbsUp size={12} /> A favor
                        </p>
                        <ul className="space-y-1.5">
                          {t.analisis.bueno.map((b: string, j: number) => (
                            <li key={j} className="text-[12px] text-emerald-900 leading-snug">· {b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {t.analisis.malo?.length > 0 && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                        <p className="text-xs font-black text-rose-800 flex items-center gap-1.5 mb-1">
                          <ThumbsDown size={12} /> En contra
                        </p>
                        <ul className="space-y-1.5">
                          {t.analisis.malo.map((m: string, j: number) => (
                            <li key={j} className="text-[12px] text-rose-900 leading-snug">· {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Los números crudos, para poder verificarlos. */}
                {t.analisis?.numeros && Object.keys(t.analisis.numeros).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-bold text-gray-600">Ver los números</summary>
                    <div className="mt-1.5 grid gap-1">
                      {Object.entries(t.analisis.numeros).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-gray-100 py-0.5">
                          <span className="text-gray-500">{k.replace(/_/g, ' ')}</span>
                          <span className="font-bold text-gray-800 text-right">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* El hueco declarado. Sin esto, el análisis se lee como si
                    lo supiera todo. */}
                {t.analisis?.no_puedo_saber?.length > 0 && (
                  <div className="border-t border-gray-200 pt-2">
                    <p className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 mb-1">
                      <HelpCircle size={11} /> Lo que no puedo saber desde acá
                    </p>
                    <ul className="space-y-0.5">
                      {t.analisis.no_puedo_saber.map((n: string, j: number) => (
                        <li key={j} className="text-[11px] text-gray-500 leading-snug">· {n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {cargando && (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Cruzando con tus planes y tus costos…
          </p>
        )}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void preguntar(texto); }}
          placeholder="Un plan de ₡10.000 con punto de venta e inventario…"
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400" />
        <button onClick={() => void preguntar(texto)} disabled={cargando || !texto.trim()}
          className="px-4 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white">
          <Send size={16} />
        </button>
      </div>

      <p className="text-[11px] text-gray-400">
        Los números salen de tus planes, tus suscripciones activas y tu consumo real de
        infraestructura. No los calcula un modelo de lenguaje: un modelo da respuestas ciertas
        y genéricas, y lo que cambia una decisión es saber cuántos de tus clientes de hoy se
        pasarían a este plan.
      </p>
    </div>
  );
};

export default AnalizarPlanChat;
