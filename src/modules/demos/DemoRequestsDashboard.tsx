import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Plus, Search, RefreshCw, Loader2, X, Save, AlertCircle, CheckCircle2,
  MonitorPlay, Phone, MessageCircle, Mail, Trash2, Clock, User, Check, KeyRound, Copy,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  demoRequestsService, type DemoRequest, type DemoStatus,
} from '@/services/demos/demoRequestsService';
import { DEMO_GROUPS, DEMO_PRESETS, moduleLabel } from './demoModules';

const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const day = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CR') : '—');
const waNumber = (phone?: string | null) => {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 8) return `506${d}`;
  if (d.startsWith('00')) return d.slice(2);
  return d;
};

const STATUS: Record<DemoStatus, { label: string; cls: string }> = {
  convertida: { label: 'Cliente',    cls: 'bg-indigo-100 text-indigo-800' },
  pendiente:  { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-800' },
  aprobada:   { label: 'Aprobada',   cls: 'bg-sky-100 text-sky-800' },
  entregada:  { label: 'Entregada',  cls: 'bg-emerald-100 text-emerald-800' },
  rechazada:  { label: 'Rechazada',  cls: 'bg-red-100 text-red-700' },
  vencida:    { label: 'Vencida',    cls: 'bg-gray-200 text-gray-700' },
};

/**
 * Solicitudes de demo.
 *
 * El vendedor visita el negocio, ve qué necesita y pide la demo con ESOS
 * módulos. Antes eso viajaba por WhatsApp: se perdía, llegaba incompleto, o
 * quien la armaba no sabía qué le habían prometido al cliente.
 */
export const DemoRequestsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const esGerencia = ['owner', 'admin', 'gerente'].includes(String(user?.role ?? ''));

  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [status, setStatus] = useState('abiertas');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [deliver, setDeliver] = useState<DemoRequest | null>(null);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [converting, setConverting] = useState<DemoRequest | null>(null);

  /** Crea el negocio de prueba y el usuario: recién ahí las credenciales sirven. */
  const armarDemo = async (r: DemoRequest) => {
    if (!window.confirm(
      `¿Crear la demo de ${r.business_name}?\n\n`
      + `Se crea el negocio de prueba con ${r.modules?.length ?? 0} módulo(s) y el usuario `
      + `${r.demo_user ?? ''} para que el cliente entre.`
    )) return;
    setProvisioning(r.id);
    try {
      const res = await demoRequestsService.provision(r.id);
      setMsg({
        kind: 'ok',
        text: `Demo lista · entra con ${res.login.user} / ${res.login.password}`,
      });
      void load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo crear la demo' });
    } finally { setProvisioning(null); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await demoRequestsService.list({ status, q: q.trim() || undefined }));
      setMsg(null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudieron cargar las solicitudes' });
    } finally { setLoading(false); }
  }, [status, q]);
  useEffect(() => { void load(); }, [status]);

  useEffect(() => {
    if (msg?.kind !== 'ok') return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const setEstado = async (r: DemoRequest, next: DemoStatus, extra?: Record<string, string>) => {
    try {
      await demoRequestsService.setStatus(r.id, { status: next, ...(extra ?? {}) } as any);
      setMsg({ kind: 'ok', text: `${r.number} · ${STATUS[next].label}` });
      setDeliver(null);
      void load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo actualizar' });
    }
  };

  const rechazar = async (r: DemoRequest) => {
    const motivo = window.prompt(`¿Por qué se rechaza la demo de ${r.business_name}?`);
    if (!motivo?.trim()) return;
    await setEstado(r, 'rechazada', { reject_reason: motivo.trim() });
  };

  const borrar = async (r: DemoRequest) => {
    if (!window.confirm(`¿Borrar la solicitud ${r.number} de ${r.business_name}?`)) return;
    try {
      await demoRequestsService.remove(r.id);
      setRows(prev => prev.filter(x => x.id !== r.id));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo borrar' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <MonitorPlay size={20} className="text-indigo-600" /> Solicitudes de demo
        </span>
        <div className="hidden sm:block flex-1" />
        <form onSubmit={e => { e.preventDefault(); void load(); }}
          className="relative flex-1 sm:flex-none sm:w-56 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Negocio, contacto o número…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
        </form>
        <button onClick={() => void load()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm">
          <Plus size={16} /> Pedir demo
        </button>
      </div>

      {!esGerencia && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 text-xs font-bold text-sky-800">
          Estás viendo <b>tus</b> solicitudes. Quien arma las demos las aprueba y te avisa el acceso.
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {[{ id: 'abiertas', label: 'Abiertas' },
          { id: 'pendiente', label: 'Pendientes' },
          { id: 'aprobada', label: 'Aprobadas' },
          { id: 'entregada', label: 'Entregadas' },
          { id: 'convertida', label: 'Convertidas' },
          { id: 'rechazada', label: 'Rechazadas' },
          { id: 'all', label: 'Todas' }].map(f => (
          <button key={f.id} onClick={() => setStatus(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border ${
              status === f.id ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-gray-400">
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-16">
          <MonitorPlay size={44} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">No hay solicitudes en esta vista.</p>
          <p className="text-xs text-gray-400 mt-1">
            Pedí una demo con los módulos que el prospecto necesita ver.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map(r => {
            const wa = waNumber(r.phone);
            const porVencer = r.expires_on && r.expires_on >= crToday();
            return (
              <div key={r.id} className="bg-white border-2 border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 truncate flex items-center gap-1.5">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${STATUS[r.status].cls}`}>
                        {STATUS[r.status].label}
                      </span>
                      {r.business_name}
                    </p>
                    <p className="text-xs font-bold text-gray-400 truncate">
                      {r.number}
                      {r.business_type ? ` · ${r.business_type}` : ''}
                      {r.requester_name ? ` · pidió ${r.requester_name}` : ''}
                    </p>
                    {r.contact_name && (
                      <p className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                        <User size={11} /> {r.contact_name}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] font-black text-gray-500 shrink-0">
                    {r.days} día(s)
                  </span>
                </div>

                {/* Qué se pidió mostrar */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {(r.modules ?? []).map(m => (
                    <span key={m} className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {moduleLabel(m)}
                    </span>
                  ))}
                </div>

                {/* Credenciales listas desde que se pide: el vendedor está EN el
                    negocio y las puede dictar en el momento. */}
                {r.demo_user && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2">
                    <KeyRound size={13} className={r.demo_tenant_id ? 'text-emerald-600 shrink-0' : 'text-amber-500 shrink-0'} />
                    <span className="text-[11px] font-black text-gray-800">
                      {r.demo_user}
                      {r.demo_password && <span className="text-gray-400"> · {r.demo_password}</span>}
                      {!r.demo_tenant_id && (
                        <span className="block text-[10px] font-bold text-amber-700">
                          Todavía no sirve para entrar: tocá «Crear demo» abajo.
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => {
                        // Antes de armar la demo, el usuario NO existe todavía en el
                        // sistema: mandarlo termina en «credenciales erróneas» del
                        // lado del cliente y en una llamada al vendedor. El aviso en
                        // pantalla no alcanzaba porque el texto copiado no lo lleva.
                        if (!r.demo_tenant_id) {
                          setMsg({ kind: 'err', text: 'Armá la demo primero: ese usuario todavía no existe y no va a poder entrar.' });
                          return;
                        }
                        const txt = `Acceso de prueba NovaPOS\nUsuario: ${r.demo_user}`
                          + (r.demo_password ? `\nClave: ${r.demo_password}` : '')
                          + (r.expires_on ? `\nVence: ${day(r.expires_on)}` : ` \nPrueba de ${r.days} días`);
                        navigator.clipboard?.writeText(txt)
                          .then(() => setMsg({ kind: 'ok', text: 'Credenciales copiadas' }))
                          .catch(() => {});
                      }}
                      title={r.demo_tenant_id
                        ? 'Copiar para mandárselas al cliente'
                        : 'Primero hay que crear la demo'}
                      className={`p-1.5 rounded-lg border ${r.demo_tenant_id
                        ? 'border-gray-200 text-gray-500 hover:bg-white'
                        : 'border-gray-200 text-gray-300 cursor-not-allowed'}`}>
                      <Copy size={12} />
                    </button>
                    {/* Solo con la demo ya creada: mandar antes es mandar un acceso muerto. */}
                    {wa && r.demo_tenant_id && (
                      <a
                        href={`https://wa.me/${wa}?text=${encodeURIComponent(
                          `Acceso de prueba NovaPOS\nUsuario: ${r.demo_user}`
                          + (r.demo_password ? `\nClave: ${r.demo_password}` : ''))}`}
                        target="_blank" rel="noopener noreferrer"
                        title="Enviar por WhatsApp al cliente"
                        className="p-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                        <MessageCircle size={12} />
                      </a>
                    )}
                    {(esGerencia || r.status === 'pendiente') && (
                      <button
                        onClick={async () => {
                          try {
                            await demoRequestsService.regenerateCredentials(r.id);
                            setMsg({ kind: 'ok', text: 'Credenciales regeneradas' });
                            void load();
                          } catch (e) {
                            setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo regenerar' });
                          }
                        }}
                        title="Generar otro usuario y clave"
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-white">
                        <RefreshCw size={12} />
                      </button>
                    )}
                  </div>
                )}

                {r.notes && (
                  <p className="text-[11px] font-semibold text-gray-500 mt-1.5">↳ {r.notes}</p>
                )}
                {r.status === 'rechazada' && r.reject_reason && (
                  <p className="text-[11px] font-black text-red-700 mt-1.5">
                    Rechazada: {r.reject_reason}
                  </p>
                )}
                {(r.status === 'entregada' || r.status === 'vencida') && (
                  <p className={`text-[11px] font-bold mt-1.5 flex items-center gap-1 ${
                    porVencer ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <Clock size={11} />
                    {porVencer ? `Prueba vence ${day(r.expires_on)}` : `Prueba venció ${day(r.expires_on)}`}
                    {r.purge_on && !r.converted_at && (
                      <span className="text-red-600">· se borra el {day(r.purge_on)}</span>
                    )}
                  </p>
                )}
                {r.converted_at && (
                  <p className="text-[11px] font-black text-indigo-700 mt-1.5">
                    Convertido en cliente el {day(r.converted_at)}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                  {wa && (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black hover:bg-emerald-100">
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  {r.phone && (
                    <a href={`tel:${r.phone}`}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-black hover:bg-gray-50">
                      <Phone size={13} /> Llamar
                    </a>
                  )}
                  {r.email && (
                    <a href={`mailto:${r.email}`}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-black hover:bg-gray-50">
                      <Mail size={13} /> Correo
                    </a>
                  )}

                  {esGerencia && r.status === 'pendiente' && (
                    <>
                      <button onClick={() => void setEstado(r, 'aprobada')}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black">
                        <Check size={13} /> Aprobar
                      </button>
                      <button onClick={() => void rechazar(r)}
                        className="px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-black hover:bg-red-50">
                        Rechazar
                      </button>
                    </>
                  )}
                  {/* El botón dice en qué va: crear la demo, que ya está creada,
                      o que el negocio ya es cliente. */}
                  {esGerencia && !r.demo_tenant_id && r.status !== 'rechazada' && (
                    <button onClick={() => void armarDemo(r)} disabled={provisioning === r.id}
                      title="Crea el negocio de prueba y el usuario: recién ahí sirve el acceso"
                      className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-50">
                      {provisioning === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Crear demo y dar acceso
                    </button>
                  )}
                  {esGerencia && r.demo_tenant_id && !r.converted_at && (
                    <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black">
                      <Check size={13} /> Usuario creado
                    </span>
                  )}
                  {esGerencia && r.converted_at && (
                    <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-black">
                      <Check size={13} /> Ya es cliente
                    </span>
                  )}

                  {/* Pasar a cliente se puede en CUALQUIER momento: con demo
                      andando, o de una si el cliente ya decidió sin probar. */}
                  {esGerencia && !r.converted_at && r.status !== 'rechazada' && (
                    <button onClick={() => setConverting(r)}
                      title={r.demo_tenant_id
                        ? 'Al cliente le gustó: elegir plan y dejar de ser demo'
                        : 'Compró sin probar: se crea el negocio ya como cliente'}
                      className="flex-1 min-w-[150px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black">
                      {r.demo_tenant_id ? 'Le gustó · pasar a cliente' : 'Pasar a cliente ya'}
                    </button>
                  )}
                  {esGerencia && (r.status === 'aprobada' || r.status === 'pendiente') && (
                    <button onClick={() => setDeliver(r)}
                      title="Anotar un acceso creado a mano, sin que el sistema arme el negocio"
                      className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-black hover:bg-gray-50">
                      Anotar entrega
                    </button>
                  )}
                  {(esGerencia || (r.status === 'pendiente' && r.requested_by === user?.id)) && (
                    <button onClick={() => void borrar(r)} title="Borrar solicitud"
                      className="px-3 py-2 rounded-xl border border-gray-200 text-red-500 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <DemoEditor
          onClose={() => setCreating(false)}
          onSaved={r => {
            setCreating(false);
            setMsg({
              kind: 'ok',
              text: r.demo_user
                ? `Solicitud ${r.number} enviada · acceso ${r.demo_user} / ${r.demo_password ?? ''}`
                : `Solicitud ${r.number} enviada`,
            });
            void load();
          }}
        />
      )}

      {converting && (
        <ConvertModal
          request={converting}
          onClose={() => setConverting(null)}
          onDone={(login, account) => {
            setConverting(null);
            setMsg({
              kind: 'ok',
              text: login
                ? `Cliente creado · entra con ${login.user} / ${login.password}`
                : account
                  ? `Convertido en cliente · dueño: ${account.email} · ya no se borra.`
                  : 'Convertido en cliente: ya no se borra y quedó con su plan.',
            });
            void load();
          }}
        />
      )}

      {deliver && (
        <DeliverModal
          request={deliver}
          onClose={() => setDeliver(null)}
          onDone={(extra) => void setEstado(deliver, 'entregada', extra)}
        />
      )}
    </div>
  );
};

/** Alta de la solicitud: datos del prospecto + módulos a mostrar. */
const DemoEditor: React.FC<{
  onClose: () => void;
  onSaved: (r: DemoRequest) => void;
}> = ({ onClose, onSaved }) => {
  const [business, setBusiness] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState('');
  const [notes, setNotes] = useState('');
  const [days, setDays] = useState('15');
  const [mods, setMods] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: string) =>
    setMods(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

  const applyPreset = (keys: string[]) =>
    setMods(prev => Array.from(new Set([...prev, ...keys])));

  const save = async () => {
    if (!business.trim()) { setError('Poné el nombre del negocio.'); return; }
    if (mods.length === 0) { setError('Marcá al menos un módulo: es lo que se le va a mostrar.'); return; }
    setSaving(true); setError(null);
    try {
      onSaved(await demoRequestsService.create({
        business_name: business.trim(),
        contact_name: contact.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        business_type: type.trim() || null,
        notes: notes.trim() || null,
        modules: mods,
        days: Number(days) || 15,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">Pedir demo</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          <input value={business} onChange={e => setBusiness(e.target.value)}
            placeholder="Nombre del negocio"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Persona de contacto"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            <input value={type} onChange={e => setType(e.target.value)}
              placeholder="Tipo de negocio (ferretería, soda…)"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono" inputMode="tel"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo" inputMode="email"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
          </div>

          {/* Paquetes: lo que se pide casi siempre, sin marcar de a uno. */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1">Paquetes rápidos</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p.modules)}
                  className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-[11px] font-black hover:bg-indigo-100">
                  {p.label}
                </button>
              ))}
              {mods.length > 0 && (
                <button onClick={() => setMods([])}
                  className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] font-black hover:bg-gray-50">
                  Limpiar ({mods.length})
                </button>
              )}
            </div>
          </div>

          {/* Módulos a mostrar */}
          <div className="space-y-2">
            <p className="text-xs font-black text-gray-500 uppercase">
              ¿Qué se le va a mostrar? ({mods.length} marcado(s))
            </p>
            {DEMO_GROUPS.map(g => (
              <div key={g.group} className="border border-gray-200 rounded-xl p-2.5">
                <p className="text-[11px] font-black text-gray-500 uppercase mb-1.5">{g.group}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {g.modules.map(m => {
                    const on = mods.includes(m.key);
                    return (
                      <button key={m.key} onClick={() => toggle(m.key)}
                        className={`flex items-start gap-2 text-left px-2 py-1.5 rounded-lg border transition ${
                          on ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-gray-50'}`}>
                        <span className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          on ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                          {on && <Check size={11} className="text-white" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-black text-gray-800">{m.label}</span>
                          {m.hint && <span className="block text-[10px] font-semibold text-gray-400">{m.hint}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-gray-500 uppercase shrink-0">Días de prueba</span>
            <input type="number" min={1} max={180} value={days} onChange={e => setDays(e.target.value)}
              className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800" />
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Notas para quien arma la demo (qué le interesa, qué le preocupa, competencia…)"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <button onClick={() => void save()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enviar solicitud
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Conversión a cliente.
 *
 * El negocio NO se recrea: se le asigna el plan y se le quita la etiqueta de
 * demo, así conserva los productos, clientes y ventas que cargó en la prueba —
 * que es justo lo que hace que un cliente se quede.
 */
const ConvertModal: React.FC<{
  request: DemoRequest;
  onClose: () => void;
  onDone: (
    login?: { user: string; password: string },
    account?: { email: string } | null,
  ) => void;
}> = ({ request, onClose, onDone }) => {
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: number; billing_cycle: string }>>([]);
  const [planId, setPlanId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Correo y clave DEFINITIVOS del cliente.
   *
   * En la prueba el acceso es desechable: un usuario inventado y una clave
   * generada. Al pasar a cliente esa cuenta se vuelve la de verdad —recibe los
   * avisos y los comprobantes—, así que es acá donde conviene ponerle el correo
   * real. Si se dejan vacíos, la cuenta sigue con lo que tenía.
   */
  const correoActual = (() => {
    const u = String(request.demo_user ?? '').trim().toLowerCase();
    return !u ? '' : u.includes('@') ? u : `${u}@nexoerp.local`;
  })();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);

  useEffect(() => {
    demoRequestsService.plans().then(setPlans).catch(() => setPlans([]));
  }, []);

  const convert = async () => {
    if (!planId) { setError('Elegí el plan que va a llevar.'); return; }
    setBusy(true); setError(null);
    try {
      const res: any = await demoRequestsService.convert(request.id, planId, { email, password });
      onDone(res?.login, res?.account ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo convertir');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-black text-gray-800">
          Pasar a cliente
          <span className="block text-xs font-bold text-gray-400">{request.business_name}</span>
        </p>
        <p className="text-[11px] font-semibold text-gray-500">
          {request.demo_tenant_id
            ? `Se le asigna el plan y deja de ser demo. Conserva todo lo que cargó en la prueba y ya no se borra${
                request.purge_on ? ` el ${day(request.purge_on)}` : ''}.`
            : 'No hay demo creada: se va a crear el negocio ya como CLIENTE, con este plan y '
              + 'el usuario de la solicitud. No se borra solo.'}
        </p>
        <select value={planId} onChange={e => setPlanId(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800">
          <option value="">Elegí el plan…</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} · ₡{Number(p.price ?? 0).toLocaleString('es-CR')}
              {String(p.billing_cycle).toLowerCase() === 'yearly' ? '/año' : '/mes'}
            </option>
          ))}
        </select>
        <div className="space-y-2 pt-1 border-t border-gray-100">
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide pt-2">
            Cuenta del dueño
          </p>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              <Mail size={11} className="inline mb-0.5" /> Correo
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={correoActual || 'correo@delcliente.com'}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
            <p className="text-[10px] text-gray-400 mt-0.5">
              {correoActual
                ? `Ahora entra con ${correoActual}. Dejalo vacío para no cambiarlo.`
                : 'Dejalo vacío para no cambiarlo.'}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              <KeyRound size={11} className="inline mb-0.5" /> Contraseña nueva
            </label>
            <div className="relative">
              <input type={verClave ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Dejar vacío para no cambiarla"
                className="w-full px-3 py-2 pr-16 border border-gray-200 rounded-xl text-sm" />
              {password && (
                <button type="button" onClick={() => setVerClave(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 hover:text-gray-600">
                  {verClave ? 'Ocultar' : 'Ver'}
                </button>
              )}
            </div>
            {password && password.length < 6 && (
              <p className="text-[10px] font-bold text-amber-600 mt-0.5">Mínimo 6 caracteres.</p>
            )}
          </div>
          <p className="flex items-start gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5">
            <Check size={12} className="mt-px shrink-0" />
            El negocio queda automáticamente a nombre del cliente, no de quien armó la demo.
          </p>
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
            <AlertCircle size={14} /> {error}
          </p>
        )}
        <button onClick={() => void convert()} disabled={busy || !planId || (!!password && password.length < 6)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmar plan
        </button>
      </div>
    </div>
  );
};

/** Entrega: qué acceso se le dio al prospecto y hasta cuándo. */
const DeliverModal: React.FC<{
  request: DemoRequest;
  onClose: () => void;
  onDone: (extra: Record<string, string>) => void;
}> = ({ request, onClose, onDone }) => {
  // Ya vienen generadas desde que se pidió: acá solo se confirman o se cambian.
  const [demoUser, setDemoUser] = useState(request.demo_user ?? '');
  const [demoPass, setDemoPass] = useState(request.demo_password ?? '');
  const [tenant, setTenant] = useState('');
  const [expires, setExpires] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(request.days) || 15));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-black text-gray-800">
          Entregar demo
          <span className="block text-xs font-bold text-gray-400">{request.business_name}</span>
        </p>
        <input value={demoUser} onChange={e => setDemoUser(e.target.value)}
          placeholder="Usuario entregado (ej. demo-ferreteria)"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
        <input value={demoPass} onChange={e => setDemoPass(e.target.value)}
          placeholder="Clave de la demo"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
        <input value={tenant} onChange={e => setTenant(e.target.value)}
          placeholder="ID del negocio de prueba (opcional)"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
        <label className="block">
          <span className="text-xs font-black text-gray-500 uppercase">Vence</span>
          <input type="date" value={expires} onChange={e => setExpires(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
        </label>
        <button
          onClick={() => onDone({
            ...(demoUser.trim() ? { demo_user: demoUser.trim() } : {}),
            ...(demoPass.trim() ? { demo_password: demoPass.trim() } : {}),
            ...(tenant.trim() ? { demo_tenant_id: tenant.trim() } : {}),
            ...(expires ? { expires_on: expires } : {}),
          })}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm">
          Marcar entregada
        </button>
      </div>
    </div>
  );
};

export default DemoRequestsDashboard;
