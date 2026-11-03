import React, { useCallback, useEffect, useState } from 'react';
import {
  Send, PhoneCall, Plus, Trash2, Loader2, X, AlertCircle, CheckCircle2,
  Truck, User, Users, MessageCircle,
} from 'lucide-react';
import {
  enviosEquipo, type Envio, type Contacto, type ResumenEquipo,
} from '@/services/taller3d/enviosService';

/**
 * ENVÍOS DEL EQUIPO — la libreta de lo que hay que mandar y a quién llamar.
 *
 * Lo que la hace distinta de un cuaderno es que cada apunte queda FIRMADO:
 * quién lo anotó y quién lo atendió. Cuando un cliente reclama que nunca le
 * llegó, esa es la única pregunta que importa y la que nadie podía contestar.
 *
 * Por omisión se ve lo PENDIENTE de cualquier día, no solo lo de hoy: un envío
 * que se quedó sin mandar el viernes sigue siendo trabajo el lunes.
 */

const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const dia = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
const cuando = (s?: string | null) =>
  s ? new Date(s).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const MEDIOS = [
  { v: 'correos', l: 'Correos' }, { v: 'uber', l: 'Uber' }, { v: 'mensajero', l: 'Mensajero' },
  { v: 'retiro', l: 'Retira en el local' }, { v: 'otro', l: 'Otro' },
] as const;
const MEDIO: Record<string, string> = Object.fromEntries(MEDIOS.map(m => [m.v, m.l]));

/** 88887777 → wa.me/50688887777 */
const wa = (tel?: string | null) => {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 8 ? `506${d}` : d;
};

export const EnviosEquipo: React.FC = () => {
  const [tab, setTab] = useState<'envios' | 'contactos'>('envios');
  const [resumen, setResumen] = useState<ResumenEquipo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarResumen = useCallback(async () => {
    try { setResumen(await enviosEquipo.resumen()); } catch { /* el resumen es de adorno */ }
  }, []);
  useEffect(() => { void cargarResumen(); }, [cargarResumen]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-gray-100 p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={24} className="text-cyan-600" />
        <h1 className="text-2xl font-black text-gray-900">Envíos del equipo</h1>
      </div>

      {/* Lo pendiente, de un vistazo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta label="Envíos pendientes" valor={resumen?.envios.pendientes ?? 0} />
        <Tarjeta label="Atrasados" valor={resumen?.envios.atrasados ?? 0}
          color={(resumen?.envios.atrasados ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'} />
        <Tarjeta label="Salieron hoy" valor={resumen?.envios.enviados_hoy ?? 0} color="text-emerald-700" />
        <Tarjeta label="Por contactar" valor={resumen?.contactos.pendientes ?? 0} />
      </div>

      {/* Quién anotó qué. Ver que 9 de 12 los anotó la misma persona y nadie
          los ha despachado es una conversación, no un dato. */}
      {(resumen?.por_persona.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="font-black text-gray-900 text-sm mb-2 flex items-center gap-1.5">
            <User size={15} className="text-cyan-600" /> Por persona
          </h3>
          <div className="flex flex-wrap gap-2">
            {resumen!.por_persona.map(p => (
              <div key={p.nombre} className="px-3 py-2 rounded-xl border border-gray-100 bg-gray-50">
                <p className="font-bold text-sm text-gray-800">{p.nombre}</p>
                <p className="text-[11px] text-gray-500">
                  {p.pendientes} pendiente(s) · {p.despachados} despachado(s)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="bg-white border border-gray-200 rounded-2xl p-1.5 flex gap-1">
        <Tab on={tab === 'envios'} onClick={() => setTab('envios')} icon={Send} label="Por mandar" />
        <Tab on={tab === 'contactos'} onClick={() => setTab('contactos')} icon={PhoneCall} label="Por contactar" />
      </nav>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={15} /></button>
        </div>
      )}
      {aviso && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 size={16} /> {aviso}
        </div>
      )}

      {tab === 'envios'
        ? <PanelEnvios onError={setError} onAviso={s => { setAviso(s); void cargarResumen(); }} />
        : <PanelContactos onError={setError} onAviso={s => { setAviso(s); void cargarResumen(); }} />}
    </div>
  );
};

// ══════════════════════════ POR MANDAR ══════════════════════════

function PanelEnvios({ onError, onAviso }: { onError: (s: string) => void; onAviso: (s: string) => void }) {
  const [lista, setLista] = useState<Envio[]>([]);
  const [estado, setEstado] = useState('pendiente');
  const [cargando, setCargando] = useState(true);
  const vacio = { cliente: '', telefono: '', direccion: '', detalle: '', medio: 'correos' };
  const [f, setF] = useState<Record<string, string>>(vacio);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setLista(await enviosEquipo.lista(estado)); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [estado, onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const agregar = async () => {
    if (!f.cliente.trim()) { onError('¿A quién hay que mandarle?'); return; }
    setGuardando(true);
    try {
      await enviosEquipo.nuevo({
        cliente: f.cliente.trim(), telefono: f.telefono.trim() || null,
        direccion: f.direccion.trim() || null, detalle: f.detalle.trim() || null,
        medio: f.medio as any, fecha: hoyCR(),
      });
      setF({ ...vacio, medio: f.medio });
      onAviso('Envío anotado');
      await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo anotar'); }
    finally { setGuardando(false); }
  };

  const mover = async (e: Envio, nuevo: any) => {
    const guia = nuevo === 'enviado' && (e.medio === 'correos' || e.medio === 'mensajero')
      ? (prompt('Número de guía (opcional):') ?? '') : undefined;
    try { await enviosEquipo.estado(e.id, nuevo, guia || undefined); onAviso('Listo'); await cargar(); }
    catch (err) { onError(err instanceof Error ? err.message : 'No se pudo'); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2">
          <Plus size={17} className="text-cyan-600" /> Anotar un envío
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })}
            placeholder="Cliente" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })}
            placeholder="Teléfono" inputMode="tel" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })}
            placeholder="Qué se le manda" className="sm:col-span-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })}
            placeholder="Dirección o sucursal" className="sm:col-span-2 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <select value={f.medio} onChange={e => setF({ ...f, medio: e.target.value })}
            className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold bg-white">
            {MEDIOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <button onClick={() => void agregar()} disabled={guardando}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Agregar
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {[['pendiente', 'Pendientes'], ['enviado', 'Enviados'], ['entregado', 'Entregados'], ['todos', 'Todos']].map(([v, l]) => (
          <button key={v} onClick={() => setEstado(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
              estado === v ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      {cargando && lista.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-12 text-sm text-gray-400">
          Nada por acá.
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(e => (
            <div key={e.id} className={`bg-white border-2 rounded-2xl p-4 ${
              e.estado === 'pendiente' && e.fecha < hoyCR() ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-black text-gray-900">
                    {e.cliente}
                    {e.estado === 'pendiente' && e.fecha < hoyCR() && (
                      <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        ATRASADO · {dia(e.fecha)}
                      </span>
                    )}
                  </p>
                  {e.detalle && <p className="text-sm text-gray-700 mt-0.5">{e.detalle}</p>}
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
                    <Truck size={11} /> {MEDIO[e.medio] ?? e.medio}
                    {e.direccion ? ` · ${e.direccion}` : ''}
                    {e.guia ? ` · guía ${e.guia}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Lo anotó {e.registrado_nombre ?? '—'} el {dia(e.fecha)}
                    {e.despachado_nombre ? ` · lo despachó ${e.despachado_nombre} el ${cuando(e.despachado_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {e.telefono && wa(e.telefono) && (
                    <a href={`https://wa.me/${wa(e.telefono)}`} target="_blank" rel="noreferrer"
                      title="Escribirle por WhatsApp"
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                      <MessageCircle size={15} />
                    </a>
                  )}
                  {e.estado === 'pendiente' && (
                    <button onClick={() => void mover(e, 'enviado')}
                      className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-black flex items-center gap-1.5">
                      <Send size={13} /> Ya salió
                    </button>
                  )}
                  {e.estado === 'enviado' && (
                    <button onClick={() => void mover(e, 'entregado')}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Llegó
                    </button>
                  )}
                  <button onClick={async () => {
                    if (!confirm(`¿Borrar el envío de ${e.cliente}?`)) return;
                    try { await enviosEquipo.borrar(e.id); await cargar(); }
                    catch (err) { onError(err instanceof Error ? err.message : 'No se pudo'); }
                  }} className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════ POR CONTACTAR ══════════════════════════

function PanelContactos({ onError, onAviso }: { onError: (s: string) => void; onAviso: (s: string) => void }) {
  const [lista, setLista] = useState<Contacto[]>([]);
  const [estado, setEstado] = useState('pendiente');
  const [cargando, setCargando] = useState(true);
  const vacio = { cliente: '', telefono: '', motivo: '' };
  const [f, setF] = useState<Record<string, string>>(vacio);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setLista(await enviosEquipo.contactos(estado)); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [estado, onError]);
  useEffect(() => { void cargar(); }, [cargar]);

  const agregar = async () => {
    if (!f.cliente.trim()) { onError('¿A quién hay que contactar?'); return; }
    setGuardando(true);
    try {
      await enviosEquipo.nuevoContacto({
        cliente: f.cliente.trim(), telefono: f.telefono.trim() || null,
        motivo: f.motivo.trim() || null, fecha: hoyCR(),
      });
      setF(vacio); onAviso('Anotado'); await cargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'No se pudo anotar'); }
    finally { setGuardando(false); }
  };

  /* Marcar «hecho» pide el resultado: una casilla marcada no le dice nada al
     que pregunta mañana qué contestó el cliente. */
  const marcar = async (c: Contacto) => {
    const resultado = prompt(`¿Qué dijo ${c.cliente}?`);
    if (resultado === null) return;
    try { await enviosEquipo.contactoHecho(c.id, resultado); onAviso('Listo'); await cargar(); }
    catch (e) { onError(e instanceof Error ? e.message : 'No se pudo'); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-black text-gray-900 flex items-center gap-2">
          <Plus size={17} className="text-cyan-600" /> Anotar un contacto
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })}
            placeholder="Cliente" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })}
            placeholder="Teléfono" inputMode="tel" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <input value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })}
            placeholder="Por qué hay que escribirle" className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm" />
          <button onClick={() => void agregar()} disabled={guardando}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Agregar
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {[['pendiente', 'Pendientes'], ['hecho', 'Hechos'], ['todos', 'Todos']].map(([v, l]) => (
          <button key={v} onClick={() => setEstado(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
              estado === v ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      {cargando && lista.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-12 text-sm text-gray-400">Nada por acá.</div>
      ) : (
        <div className="space-y-2">
          {lista.map(c => (
            <div key={c.id} className={`bg-white border-2 rounded-2xl p-4 ${
              c.estado === 'pendiente' && c.fecha < hoyCR() ? 'border-amber-200' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-black text-gray-900">{c.cliente}</p>
                  {c.motivo && <p className="text-sm text-gray-700 mt-0.5">{c.motivo}</p>}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Lo anotó {c.registrado_nombre ?? '—'} el {dia(c.fecha)}
                    {c.hecho_nombre ? ` · lo atendió ${c.hecho_nombre} el ${cuando(c.hecho_at)}` : ''}
                  </p>
                  {c.resultado && (
                    <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2 mt-2">↳ {c.resultado}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {c.telefono && wa(c.telefono) && (
                    <a href={`https://wa.me/${wa(c.telefono)}`} target="_blank" rel="noreferrer"
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                      <MessageCircle size={15} />
                    </a>
                  )}
                  {c.estado === 'pendiente' && (
                    <button onClick={() => void marcar(c)}
                      className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-black flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Ya le hablé
                    </button>
                  )}
                  <button onClick={async () => {
                    if (!confirm(`¿Borrar el contacto de ${c.cliente}?`)) return;
                    try { await enviosEquipo.borrarContacto(c.id); await cargar(); }
                    catch (err) { onError(err instanceof Error ? err.message : 'No se pudo'); }
                  }} className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({ on, onClick, icon: Icon, label }: {
  on: boolean; onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black transition ${
        on ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
      <Icon size={15} /> {label}
    </button>
  );
}

function Tarjeta({ label, valor, color = 'text-gray-900' }: { label: string; valor: number; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
      <p className="text-[11px] font-bold text-gray-500">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

export default EnviosEquipo;
