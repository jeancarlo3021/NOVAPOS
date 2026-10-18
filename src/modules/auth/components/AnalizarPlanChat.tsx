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

                {/* El veredicto arriba: es lo único que mucha gente va a leer. */}
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
