'use client';

import React, { useState } from 'react';
import { Sparkles, Send, Loader2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * ASISTENTE: preguntas sobre el negocio, en español.
 *
 * Las respuestas las arma el servidor consultando la base del negocio, así que
 * los números son los de verdad y la consulta no tiene costo.
 *
 * Cada respuesta dice DE DÓNDE salió (período y tabla). Un asistente que tira
 * una cifra sin decir sobre qué la calculó no sirve para decidir nada, y el día
 * que alguien encuentra un número que no cuadra deja de creerle a todos.
 */
interface Respuesta {
  pregunta: string;
  texto: string;
  detalle?: string | null;
  fuente?: string | null;
}

const SUGERENCIAS = [
  '¿Cuánto vendí este mes?',
  '¿Qué producto me deja más plata?',
  '¿Cuánto me deben?',
  '¿Qué se está acabando?',
];

export const AsistenteIA: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pregunta, setPregunta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [historial, setHistorial] = useState<Respuesta[]>([]);
  const [error, setError] = useState('');

  const preguntar = async (texto: string) => {
    const q = texto.trim();
    if (!q || cargando) return;
    setCargando(true); setError(''); setPregunta('');
    try {
      const r = await apiFetch<{ modo: string; aviso?: string; datos: any }>(
        '/ia/preguntar', { method: 'POST', body: JSON.stringify({ pregunta: q }) }, 30000);
      setHistorial(h => [...h, {
        pregunta: q,
        texto: r?.datos?.respuesta ?? 'Sin respuesta',
        detalle: r?.datos?.detalle ?? null,
        fuente: r?.datos?.fuente ?? null,
      }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar');
    } finally { setCargando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh]">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 flex items-center justify-between sm:rounded-t-2xl">
          <h2 className="text-white font-black flex items-center gap-2">
            <Sparkles size={17} /> Preguntale a tu negocio
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {historial.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Preguntá en español sobre tus ventas, lo que te deben y tu inventario.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGERENCIAS.map(s => (
                  <button key={s} onClick={() => void preguntar(s)}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:border-violet-300 hover:bg-violet-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : historial.map((h, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-right"><span className="inline-block bg-violet-600 text-white text-sm font-semibold px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[85%]">{h.pregunta}</span></p>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2">
                <p className="text-sm text-gray-900">{h.texto}</p>
                {h.detalle && <p className="text-[11px] text-gray-600 mt-1">{h.detalle}</p>}
                {/* De dónde salió el número: sin esto, no se puede verificar. */}
                {h.fuente && <p className="text-[10px] text-gray-400 mt-1">{h.fuente}</p>}
              </div>
            </div>
          ))}
          {cargando && (
            <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Buscando en tus datos…</p>
          )}
          {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
        </div>

        <div className="p-3 border-t border-gray-100 flex gap-2">
          <input value={pregunta} onChange={e => setPregunta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void preguntar(pregunta); }}
            placeholder="¿Cuánto vendí esta semana?"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400" />
          <button onClick={() => void preguntar(pregunta)} disabled={cargando || !pregunta.trim()}
            className="px-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AsistenteIA;
