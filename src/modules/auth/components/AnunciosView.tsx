'use client';

import React, { useEffect, useState } from 'react';
import {
  Megaphone, Send, Loader2, AlertTriangle, Users2, Sparkles, CheckCircle2, History,
  Clock, X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * ANUNCIOS: contarle a los clientes que salió algo nuevo.
 *
 * La pantalla está armada alrededor de una idea: esto le escribe por WhatsApp
 * a clientes de verdad y no se puede deshacer. Por eso el orden es
 * obligatorio —elegir a quién, VER la lista, probar en el propio teléfono, y
 * recién ahí mandar— y el botón de enviar dice cuántos van a recibirlo.
 */

type Estado = 'al_dia' | 'moroso' | 'inactivo';
const ETIQUETA: Record<Estado, string> = {
  al_dia: 'Al día', moroso: 'Morosos', inactivo: 'Inactivos',
};

export const AnunciosView: React.FC = () => {
  const [planes, setPlanes] = useState<any[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [estados, setEstados] = useState<Estado[]>(['al_dia']);
  const [lista, setLista] = useState<any[]>([]);
  const [sinTelefono, setSinTelefono] = useState(0);
  const [cargando, setCargando] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [telPrueba, setTelPrueba] = useState('');
  /**
   * Cuándo sale. Vacío = ahora.
   *
   * El campo da la hora LOCAL del navegador, que para quien usa esto es la
   * de Costa Rica. Se manda al servidor en UTC: guardar «14:30» sin zona es
   * el error clásico —el servidor corre en UTC y el aviso saldría a las 8:30
   * de la mañana—.
   */
  const [cuando, setCuando] = useState('');
  /**
   * Los negocios destildados a mano.
   *
   * Se guardan los EXCLUIDOS y no los incluidos a propósito: así, cuando
   * alguien cambia el filtro de plan, los que entran nuevos vienen marcados
   * —que es lo que uno espera— en vez de aparecer apagados y en silencio.
   */
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [historial, setHistorial] = useState<any[]>([]);

  const [recs, setRecs] = useState<any>(null);
  const [cargandoRecs, setCargandoRecs] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams();
      if (elegidos.length) q.set('planes', elegidos.join(','));
      if (estados.length) q.set('estados', estados.join(','));
      const r = await apiFetch<any>(`/admin/anuncios/destinatarios?${q}`, {}, 60000);
      setPlanes(r.planes ?? []);
      setLista(r.destinatarios ?? []);
      setSinTelefono(r.sin_telefono ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  };
  useEffect(() => {
    // Cambió el filtro: la selección manual anterior ya no corresponde a esta
    // lista. Arrastrarla haría que quedara gente apagada sin motivo visible.
    setExcluidos([]);
    void cargar();
    /* eslint-disable-next-line */
  }, [elegidos, estados]);
  const recargarListas = async () => {
    try { setHistorial((await apiFetch<any>('/admin/anuncios')).anuncios ?? []); } catch { /* sin bitácora igual funciona */ }
    try { setPendientes((await apiFetch<any>('/admin/anuncios/pendientes')).pendientes ?? []); } catch { /* idem */ }
  };
  useEffect(() => { void recargarListas(); }, []);

  const verRecomendaciones = async () => {
    setCargandoRecs(true);
    try { setRecs(await apiFetch<any>('/admin/anuncios/recomendaciones', {}, 120000)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo calcular'); }
    finally { setCargandoRecs(false); }
  };

  const probar = async () => {
    if (!telPrueba.trim() || !mensaje.trim()) { setError('Escribí el mensaje y un número de prueba.'); return; }
    setEnviando(true); setError(''); setAviso('');
    try {
      const r = await apiFetch<any>('/admin/anuncios/enviar', {
        method: 'POST', body: JSON.stringify({ mensaje, prueba: telPrueba.trim() }),
      }, 30000);
      setAviso(r.ok ? 'Prueba enviada: revisá tu teléfono antes de mandarlo a todos.' : `No salió: ${r.error}`);
      if (!r.ok) setError(r.error ?? 'No se pudo enviar la prueba');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar'); }
    finally { setEnviando(false); }
  };

  const enviar = async () => {
    const programado = cuando.trim();
    const cuandoISO = programado ? new Date(programado).toISOString() : '';
    const leyenda = programado
      ? `se va a programar para el ${new Date(programado).toLocaleString('es-CR')}`
      : 'se va a mandar AHORA';
    if (!confirm(`El anuncio ${leyenda} a ${seleccionados.length} negocio(s) por WhatsApp.`
      + (programado ? ' Podés cancelarlo hasta esa hora.' : ' Esto no se puede deshacer.')
      + '\n\n¿Seguimos?')) return;

    setEnviando(true); setError(''); setAviso('');
    try {
      const r = await apiFetch<any>('/admin/anuncios/enviar', {
        method: 'POST',
        body: JSON.stringify({
          titulo, mensaje, planes: elegidos, estados, programar_para: cuandoISO,
          // La lista exacta solo viaja si se tocó algo: así, sin tocar nada,
          // el servidor sigue resolviendo por filtros y el resultado es el
          // mismo aunque alguien se dé de alta entre que se arma y se manda.
          tenant_ids: excluidos.length > 0 ? seleccionados.map(d => d.tenant_id) : undefined,
        }),
      }, 120000);

      if (r.programado) {
        setAviso(`Programado para el ${new Date(r.para).toLocaleString('es-CR')} · `
          + `${r.destinatarios} negocio(s). Lo podés cancelar hasta esa hora.`);
      } else {
        /**
         * Puede quedar gente pendiente, y hay que decirlo.
         *
         * Entre mensaje y mensaje hay una pausa, y no todos entran en el
         * tiempo que el servidor permite por petición. El resto lo sigue el
         * trabajo programado. Callarlo haría pensar que llegó a todos.
         */
        setAviso(`Enviado a ${r.enviados} negocio(s)${r.fallidos ? `, ${r.fallidos} fallaron` : ''}.`
          + (r.faltan > 0
            ? ` Quedan ${r.faltan} en cola: salen solos en los próximos minutos, o tocá enviar otra vez (nadie recibe dos veces).`
            : ''));
      }
      if (r.errores?.length) setError(`Algunos no salieron — ${r.errores.join(' · ')}`);
      setTitulo(''); setMensaje(''); setCuando('');
      await recargarListas();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar'); }
    finally { setEnviando(false); }
  };

  const cancelar = async (a: any) => {
    if (!confirm(`¿Cancelar «${a.titulo}»? No se va a mandar.`)) return;
    try {
      await apiFetch(`/admin/anuncios/${a.id}`, { method: 'DELETE' });
      setAviso(`«${a.titulo}» cancelado.`);
      await recargarListas();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cancelar'); }
  };

  /** Los que SÍ se les puede escribir, y los que además quedaron marcados. */
  const conTelefono = lista.filter(d => d.telefono);
  const seleccionados = conTelefono.filter(d => !excluidos.includes(d.tenant_id));

  const toggle = (arr: string[], v: string, set: (x: any) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Megaphone size={18} className="text-indigo-600" /> Anuncios
        </h2>
        <p className="text-sm text-gray-500">
          Avisarle a los negocios de un módulo nuevo o de un cambio, por WhatsApp.
        </p>
      </div>

      {aviso && <p className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {/* ── 1. A QUIÉN ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
          <Users2 size={15} className="text-gray-400" /> 1 · A quién le llega
        </h3>

        <div>
          <p className="text-xs font-bold text-gray-600 mb-1.5">Planes (ninguno marcado = todos)</p>
          <div className="flex flex-wrap gap-1.5">
            {planes.map(p => {
              const on = elegidos.includes(p.plan_id);
              return (
                <button key={p.plan_id} onClick={() => toggle(elegidos, p.plan_id, setElegidos)}
                  title={`${p.con_telefono} de ${p.total} tienen teléfono guardado`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                    on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                  {p.plan} <span className={on ? 'opacity-80' : 'text-gray-400'}>{p.con_telefono}/{p.total}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-600 mb-1.5">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {(['al_dia', 'moroso', 'inactivo'] as Estado[]).map(e => {
              const on = estados.includes(e);
              return (
                <button key={e} onClick={() => toggle(estados, e, setEstados)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                    on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {ETIQUETA[e]}
                </button>
              );
            })}
          </div>
          {estados.includes('moroso') && (
            <p className="text-[11px] text-amber-700 mt-1.5">
              Vas a incluir morosos. Un anuncio de novedades a alguien que debe suele caer mal:
              conviene cobrarle primero.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          {cargando ? (
            <span className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Contando…</span>
          ) : (
            <>
              <span className="text-sm font-black text-gray-900">{seleccionados.length} lo van a recibir</span>
              {sinTelefono > 0 && (
                <span className="text-xs text-amber-700 font-semibold" title="No tienen teléfono guardado en ningún lado">
                  · {sinTelefono} quedan fuera por no tener teléfono
                </span>
              )}
              {excluidos.length > 0 && (
                <span className="text-xs text-gray-500">· {excluidos.length} destildados por vos</span>
              )}
            </>
          )}
        </div>

        {/* La lista exacta. Sin verla no se manda nada. */}
        {/* LA LISTA, seleccionable uno por uno.
            Abierta por omisión: esto le escribe a clientes reales, y una
            lista escondida detrás de un «ver» es una lista que nadie mira
            antes de apretar enviar. */}
        {lista.length > 0 && (
          <details open className="text-xs">
            <summary className="cursor-pointer font-bold text-gray-600">
              Quién lo recibe ({seleccionados.length} de {conTelefono.length})
            </summary>
            <div className="flex gap-3 mt-1.5 mb-1">
              <button onClick={() => setExcluidos([])}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">
                Marcar todos
              </button>
              <button onClick={() => setExcluidos(conTelefono.map(d => d.tenant_id))}
                className="text-[11px] font-bold text-gray-500 hover:text-gray-800">
                Desmarcar todos
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-0.5 border border-gray-100 rounded-lg p-1.5">
              {lista.map(d => {
                const marcado = !!d.telefono && !excluidos.includes(d.tenant_id);
                return (
                  <label key={d.tenant_id}
                    title={d.telefono ? '' : 'Sin teléfono guardado: no se le puede escribir'}
                    className={`flex items-center gap-2 py-1 px-1 rounded ${
                      d.telefono ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                    <input type="checkbox" checked={marcado} disabled={!d.telefono}
                      onChange={() => setExcluidos(x => x.includes(d.tenant_id)
                        ? x.filter(y => y !== d.tenant_id)
                        : [...x, d.tenant_id])} />
                    <span className={`flex-1 min-w-0 truncate ${marcado ? 'text-gray-800' : 'text-gray-400'}`}>
                      {d.negocio}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">{d.plan}</span>
                    <span className="text-gray-400 tabular-nums shrink-0">
                      {d.telefono ?? 'sin teléfono'}
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        )}
      </div>

      {/* ── 2. QUÉ DECIR, con ayuda ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900">2 · Qué decir</h3>
          <button onClick={() => void verRecomendaciones()} disabled={cargandoRecs}
            className="flex items-center gap-1.5 text-xs font-bold text-violet-700 disabled:text-gray-400">
            {cargandoRecs ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            ¿Qué les conviene que les cuente?
          </button>
        </div>

        {/* La ayuda: qué módulos tienen pagos y no usan. Medido, no supuesto. */}
        {recs && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs space-y-2">
            <p className="font-bold text-violet-900">
              Módulos que ya están incluidos en sus planes y nadie usa:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(recs.mas_desaprovechados ?? []).slice(0, 6).map((m: any) => (
                <button key={m.modulo}
                  onClick={() => setMensaje(
                    `Hola 👋 Te escribimos de ColónClick.\n\n`
                    + `¿Sabías que tu plan ya incluye ${m.modulo}? No tiene costo extra: está pago.\n\n`
                    + `Si querés, te mostramos cómo usarlo en 10 minutos por videollamada. Respondé este mensaje y coordinamos.`)}
                  className="bg-white border border-violet-200 rounded-full px-2.5 py-1 font-bold text-violet-800 hover:bg-violet-100">
                  {m.modulo} · {m.negocios} negocios
                </button>
              ))}
            </div>
            <p className="text-[10px] text-violet-600">
              Sale de comparar lo que cada plan tiene activado contra si ese módulo tiene datos.
              Tocá uno y se arma el mensaje.
            </p>
          </div>
        )}

        <input value={titulo} onChange={e => setTitulo(e.target.value)}
          placeholder="Título (solo para la bitácora, no se manda)"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
        <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={7}
          placeholder={'El mensaje, tal cual lo va a leer el cliente.\n\nTip: que diga qué gana él, no qué hicimos nosotros.'}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono" />
        <p className="text-[11px] text-gray-400">{mensaje.length}/1200 caracteres</p>
      </div>

      {/* ── 3. PROBAR Y MANDAR ── */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black text-gray-900">3 · Probar y mandar</h3>
        <div className="flex gap-2 flex-wrap items-center">
          <input value={telPrueba} onChange={e => setTelPrueba(e.target.value)}
            placeholder="Tu número (8888-8888)"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-44" />
          <button onClick={() => void probar()} disabled={enviando || !mensaje.trim()}
            className="px-3 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-700 disabled:opacity-40">
            Enviarme la prueba
          </button>
          <span className="text-[11px] text-gray-500">
            Un error de redacción visto en tu teléfono cuesta cero; visto por {seleccionados.length} clientes, no se deshace.
          </span>
        </div>
        {/* CUÁNDO SALE.
            Vacío = ahora. Con fecha y hora queda programado y se puede
            cancelar hasta ese momento, que es la diferencia que importa:
            un envío inmediato no se deshace. */}
        <div className="flex items-end gap-2 flex-wrap border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1.5">
              <Clock size={12} /> Programar para (opcional)
            </label>
            <input type="datetime-local" value={cuando} onChange={e => setCuando(e.target.value)}
              min={new Date(Date.now() + 120000).toISOString().slice(0, 16)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          {cuando && (
            <button onClick={() => setCuando('')}
              className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-800">
              Mandar ahora
            </button>
          )}
          <span className="text-[11px] text-gray-500 flex-1 min-w-[180px]">
            {cuando
              ? `Sale el ${new Date(cuando).toLocaleString('es-CR')}, hora de Costa Rica. Lo podés cancelar hasta entonces.`
              : 'Sin fecha, sale apenas toques el botón.'}
          </span>
        </div>

        <button onClick={() => void enviar()}
          disabled={enviando || !mensaje.trim() || !titulo.trim() || seleccionados.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black disabled:bg-gray-300">
          {enviando ? <Loader2 size={16} className="animate-spin" />
            : cuando ? <Clock size={16} /> : <Send size={16} />}
          {cuando
            ? `Programar para ${seleccionados.length} negocio(s)`
            : `Mandar a ${seleccionados.length} negocio(s)`}
        </button>
        <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
          Va de a uno con pausa entre mensajes: una ráfaga de envíos seguidos es justo el patrón
          que hace que WhatsApp marque la cuenta. Queda registrado a quién se le mandó, para no
          repetirlo.
        </p>
      </div>

      {/* LO QUE TODAVÍA NO SALIÓ.
          Programados y los que quedaron a medio mandar van juntos: para
          quien mira, «sale mañana a las 9» y «faltan ocho» son lo mismo,
          algo que todavía no terminó. */}
      {pendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-black text-amber-900 flex items-center gap-2 mb-2">
            <Clock size={15} /> Todavía no salieron
          </h3>
          {pendientes.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-amber-100 last:border-0">
              <span className="font-bold text-amber-900 truncate" title={a.mensaje}>{a.titulo}</span>
              <span className="text-amber-800 shrink-0 flex items-center gap-2">
                {a.estado === 'programado' && a.programado_para
                  ? `sale el ${new Date(a.programado_para).toLocaleString('es-CR')}`
                  : `enviando… ${a.enviados} de ${a.segmento?.destinatarios ?? '?'}`}
                <button onClick={() => void cancelar(a)} title="Cancelar"
                  className="text-amber-500 hover:text-red-600"><X size={13} /></button>
              </span>
            </div>
          ))}
        </div>
      )}

      {historial.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-2">
            <History size={15} className="text-gray-400" /> Anuncios anteriores
          </h3>
          {historial.map(a => (
            <div key={a.id} className="flex justify-between gap-3 text-xs py-1.5 border-b border-gray-50 last:border-0">
              <span className="font-bold text-gray-700 truncate" title={a.mensaje}>{a.titulo}</span>
              <span className="text-gray-500 shrink-0 tabular-nums">
                {a.enviados} enviados{a.fallidos ? ` · ${a.fallidos} fallaron` : ''} ·{' '}
                {a.sent_at ? new Date(a.sent_at).toLocaleDateString('es-CR') : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
        <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
        Los anuncios salen por el worker de WhatsApp (el del código QR), porque son texto libre.
        Por la Cloud API de Meta el texto libre solo se puede mandar dentro de las 24 horas
        posteriores a que el cliente escriba.
      </p>
    </div>
  );
};

export default AnunciosView;
