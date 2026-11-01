import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, X, Send, Loader2, Sparkles, Eraser, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';

interface Mensaje {
  rol: 'usuario' | 'asistente';
  texto: string;
  detalle?: string | null;
  fuente?: string | null;
  sugerencias?: string[];
  path?: string | null;
}

interface RespuestaIA {
  modo: 'demo' | 'real';
  aviso?: string;
  datos: {
    respuesta: string;
    detalle?: string | null;
    fuente?: string | null;
    sugerencias?: string[];
    no_entendida?: boolean;
    path?: string | null;
  };
}

/** Lo que se ofrece al abrir: las preguntas que el sistema contesta con datos. */
const ARRANQUE = [
  '¿Cuánto vendí este mes?',
  '¿Qué se está acabando?',
  '¿Cuánto me deben?',
  '¿Qué producto me deja más plata?',
];

const LLAVE = (t?: string | null) => `novapos_chat_${t ?? 'local'}`;
/** Cuántos mensajes se recuerdan. Más que esto no ayuda y se paga en cada envío. */
const TOPE_HISTORIAL = 20;

/**
 * EL CHATBOT del tablero — mismo botón flotante que las notificaciones.
 *
 * Está al lado de las notificaciones a propósito: son las dos cosas que se
 * consultan de paso, sin abandonar lo que se estaba haciendo. Una dice qué hay
 * que atender; el otro contesta preguntas sobre el negocio.
 *
 * ── Lo que cuesta y lo que no ─────────────────────────────────────────────
 * Las preguntas de siempre —cuánto vendí, qué se acaba, quién me debe— las
 * contesta el servidor con una consulta a la base: son gratis y los números
 * son exactos. Solo lo que nadie supo entender llega a un modelo, y únicamente
 * si el administrador encendió la IA.
 *
 * Por eso NO se manda nada mientras se escribe: se manda al tocar enviar o
 * Enter. Un asistente que consulta por cada letra tecleada es una factura
 * mensual sin ningún beneficio.
 */
export const ChatbotMenu: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [modo, setModo] = useState<{
    modo: string; proveedor: string | null;
    creditos?: { incluidos: number; usadas: number; disponibles: number | null; reinicia: string };
  } | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  // La conversación sobrevive a cambiar de pantalla: el dueño pregunta algo,
  // va a verlo, y vuelve. Perder el hilo en el camino lo obliga a repetirse.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LLAVE(tenantId));
      if (raw) setMensajes(JSON.parse(raw).slice(-TOPE_HISTORIAL));
    } catch { /* sin historial */ }
  }, [tenantId]);

  useEffect(() => {
    try { localStorage.setItem(LLAVE(tenantId), JSON.stringify(mensajes.slice(-TOPE_HISTORIAL))); }
    catch { /* sin espacio */ }
  }, [mensajes, tenantId]);

  // Con qué está contestando: lo dice la pantalla, no se adivina.
  useEffect(() => {
    if (!abierto || modo) return;
    apiFetch<any>('/ia/estado')
      .then(setModo).catch(() => setModo({ modo: 'demo', proveedor: null }));
  }, [abierto, modo]);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, abierto, pensando]);

  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [abierto]);

  const enviar = async (q: string) => {
    const pregunta = q.trim();
    if (!pregunta || pensando) return;
    setTexto('');
    const previos = mensajes;
    setMensajes(m => [...m, { rol: 'usuario', texto: pregunta }]);
    setPensando(true);
    try {
      const r = await apiFetch<RespuestaIA>('/ia/preguntar', {
        method: 'POST',
        body: JSON.stringify({
          pregunta,
          // Solo las últimas vueltas: mandar la charla entera se paga en cada
          // mensaje y a la cuarta pregunta cuesta más que la respuesta.
          historial: previos.slice(-6).map(m => ({ rol: m.rol, texto: m.texto })),
        }),
      }, 30_000);
      // El contador de la cabecera se mueve con cada respuesta que gastó.
      if ((r.datos as any)?.creditos) {
        setModo(prev => (prev ? { ...prev, creditos: (r.datos as any).creditos } : prev));
      }
      setMensajes(m => [...m, {
        rol: 'asistente',
        texto: r.datos?.respuesta ?? 'No pude contestar eso.',
        detalle: r.datos?.detalle ?? null,
        fuente: r.datos?.fuente ?? (r.modo === 'demo' ? 'Datos de tu negocio' : null),
        sugerencias: r.datos?.sugerencias ?? [],
        path: r.datos?.path ?? null,
      }]);
    } catch (e) {
      setMensajes(m => [...m, {
        rol: 'asistente',
        texto: e instanceof Error ? e.message : 'No se pudo preguntar. Revisá la conexión.',
      }]);
    } finally { setPensando(false); }
  };

  return (
    <>
      {abierto && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setAbierto(false)} aria-hidden />
      )}

      {/* ARRIBA del botón de notificaciones, con aire de por medio.
          Los dos viven en la misma esquina y los dos se tocan, así que no
          alcanza con que no se monten: pegados se tocaba el equivocado, y el
          globito con el número de avisos se metía en el medio. 96 px de base
          dejan 24 px limpios entre una bolita y la otra. */}
      <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2">
        {abierto && (
          <div className="w-[min(92vw,23rem)] h-[min(78vh,34rem)] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
              <span className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                <Bot size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 text-sm leading-tight">Asistente</p>
<p className="text-[10px] text-gray-400 leading-tight">
                  {modo?.modo === 'real'
                    ? `Datos de tu negocio + ${modo.proveedor === 'gemini' ? 'Gemini Flash' : 'Claude'}`
                    : 'Contesta con los datos de tu negocio'}
                  {/* Las consultas al modelo son limitadas y se ven: así nadie
                      se entera de que se acabaron justo cuando las necesita. */}
                  {modo?.creditos && modo.creditos.incluidos > 0 && (
                    <span className={modo.creditos.disponibles === 0 ? ' text-red-500 font-bold' : ''}>
                      {' · '}{modo.creditos.disponibles} de {modo.creditos.incluidos} consultas
                    </span>
                  )}
                </p>
              </div>
              {mensajes.length > 0 && (
                <button onClick={() => setMensajes([])} title="Borrar la conversación"
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><Eraser size={14} /></button>
              )}
              <button onClick={() => setAbierto(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {mensajes.length === 0 && (
                <div className="text-center py-6">
                  <Sparkles size={26} className="mx-auto text-violet-400 mb-2" />
                  <p className="text-sm font-bold text-gray-700">Preguntame sobre tu negocio</p>
                  <p className="text-[11px] text-gray-400 mb-3">Los números salen de tus datos, no inventados.</p>
                  <div className="space-y-1.5">
                    {ARRANQUE.map(s => (
                      <button key={s} onClick={() => void enviar(s)}
                        className="w-full text-left px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:border-violet-300 hover:bg-violet-50">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((m, i) => (
                <div key={i} className={m.rol === 'usuario' ? 'flex justify-end' : ''}>
                  <div className={m.rol === 'usuario'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 text-white px-3 py-2 text-sm font-semibold'
                    : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-gray-50 border border-gray-100 px-3 py-2'}>
                    <p className={m.rol === 'usuario' ? '' : 'text-sm text-gray-800 whitespace-pre-line'}>{m.texto}</p>
                    {m.detalle && <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-line">{m.detalle}</p>}
                    {m.fuente && (
                      <p className="text-[10px] text-gray-400 mt-1.5 italic">{m.fuente}</p>
                    )}
                    {m.path && (
                      <button onClick={() => { setAbierto(false); navigate(m.path!); }}
                        className="mt-1.5 text-[11px] font-black text-violet-700 hover:underline inline-flex items-center gap-0.5">
                        Abrirlo <ChevronRight size={12} />
                      </button>
                    )}
                    {(m.sugerencias ?? []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.sugerencias!.slice(0, 3).map(s => (
                          <button key={s} onClick={() => void enviar(s)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-600 hover:border-violet-300">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {pensando && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" /> Buscando en tus datos…
                </p>
              )}
              <div ref={finRef} />
            </div>

            <div className="border-t border-gray-100 p-2.5 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => {
                    // Enter envía; Shift+Enter hace salto de línea. NO se
                    // consulta mientras se escribe: se paga por consulta.
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto); }
                  }}
                  rows={1}
                  placeholder="Escribí tu pregunta…"
                  className="flex-1 resize-none max-h-24 px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
                />
                <button onClick={() => void enviar(texto)} disabled={pensando || !texto.trim()}
                  aria-label="Enviar"
                  className="w-10 h-10 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 text-white flex items-center justify-center">
                  {pensando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        )}

        {!abierto && (
          <button onClick={() => setAbierto(true)} title="Asistente"
            className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg flex items-center justify-center">
            <Bot size={22} />
          </button>
        )}
      </div>
    </>
  );
};

export default ChatbotMenu;
