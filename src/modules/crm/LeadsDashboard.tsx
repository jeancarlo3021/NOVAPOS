import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Plus, Search, RefreshCw, Loader2, X, Save, AlertCircle, CheckCircle2,
  Phone, MessageCircle, MapPin, Mail, Clock, User, Trash2, TrendingUp, CalendarDays,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { customersService, type Customer } from '@/services/customers/customersService';
import { salesAgentsService, agentOrdersService, type SalesAgent } from '@/services/agents/salesAgentsService';
import { useAuth } from '@/context/AuthContext';
import { leadsService, type Lead, type LeadStatus } from '@/services/leads/leadsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const day = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CR') : '—');
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Número listo para wa.me (CR va sin código de país en la ficha). */
const waNumber = (phone?: string | null) => {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 8) return `506${d}`;
  if (d.startsWith('00')) return d.slice(2);
  return d;
};

const STAGES: Array<{ id: LeadStatus; label: string; cls: string }> = [
  { id: 'nuevo',       label: 'Nuevo',       cls: 'bg-gray-100 text-gray-700' },
  { id: 'contactado',  label: 'Contactado',  cls: 'bg-sky-100 text-sky-800' },
  { id: 'cotizado',    label: 'Cotizado',    cls: 'bg-violet-100 text-violet-800' },
  { id: 'negociacion', label: 'Negociando',  cls: 'bg-amber-100 text-amber-800' },
  { id: 'ganado',      label: 'Ganado',      cls: 'bg-emerald-100 text-emerald-800' },
  { id: 'perdido',     label: 'Perdido',     cls: 'bg-red-100 text-red-700' },
];
const stageOf = (s: string) => STAGES.find(x => x.id === s) ?? STAGES[0];

const SOURCES = ['whatsapp', 'llamada', 'visita', 'referido', 'redes', 'mostrador', 'otro'];
const KINDS: Array<{ id: string; label: string }> = [
  { id: 'llamada',    label: 'Llamada' },
  { id: 'whatsapp',   label: 'WhatsApp' },
  { id: 'visita',     label: 'Visita' },
  { id: 'correo',     label: 'Correo' },
  { id: 'cotizacion', label: 'Cotización enviada' },
  { id: 'otro',       label: 'Otro' },
];

/**
 * Seguimiento de clientes.
 *
 * Un interesado no se atiende de una: escribe, se le pasa precio, queda de
 * pensarlo, hay que volver a llamarlo el jueves. Todo eso vivía en la cabeza del
 * agente —y se iba con él—. Acá cada interesado tiene su historia, su etapa y su
 * próxima fecha de contacto, hasta que se convierte en venta o se pierde con un
 * motivo que se puede leer después.
 */
export const LeadsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const { user } = useAuth();
  // Gerencia ve la cartera completa; el agente, solo lo suyo (lo aplica el
  // backend; acá se dice, para que nadie crea que faltan seguimientos).
  const esGerencia = ['owner', 'admin', 'gerente'].includes(String(user?.role ?? ''));
  /** El agente ligado a este usuario, para que lo que registre quede a su nombre. */
  const [myAgent, setMyAgent] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { agentOrdersService.me().then(setMyAgent).catch(() => setMyAgent(null)); }, []);

  const [rows, setRows] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof leadsService.summary>> | null>(null);
  const [status, setStatus] = useState<string>('abiertos');
  const [onlyDue, setOnlyDue] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    salesAgentsService.list().then(a => setAgents(a.filter(x => x.is_active))).catch(() => {});
    customersService.list().then(cs => setCustomers(cs ?? [])).catch(() => {});
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        leadsService.list({ status, q: q.trim() || undefined, due: onlyDue || undefined }),
        leadsService.summary().catch(() => null),
      ]);
      setRows(r);
      setSummary(s);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar el seguimiento' });
    } finally { setLoading(false); }
  }, [status, onlyDue, q]);
  useEffect(() => { void load(); }, [status, onlyDue]);   // la búsqueda va con Enter

  useEffect(() => {
    if (msg?.kind !== 'ok') return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const vencido = (l: Lead) =>
    !!l.next_follow_up && l.next_follow_up < crToday() && l.status !== 'ganado' && l.status !== 'perdido';

  const abiertos = useMemo(
    () => rows.filter(l => l.status !== 'ganado' && l.status !== 'perdido'), [rows]);
  const pipeline = abiertos.reduce((s, l) => s + Number(l.estimated_amount || 0), 0);

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <TrendingUp size={20} className="text-fuchsia-600" /> Leads · seguimiento de clientes
        </span>
        <div className="hidden sm:block flex-1" />
        <form onSubmit={e => { e.preventDefault(); void load(); }}
          className="relative flex-1 sm:flex-none sm:w-60 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Cliente, teléfono o qué pidió…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
        </form>
        <button onClick={() => void load()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black text-sm">
          <Plus size={16} /> Nuevo interesado
        </button>
      </div>

      {!esGerencia && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 text-xs font-bold text-sky-800">
          Estás viendo <b>tus</b> seguimientos: los que registraste o tenés asignados.
          La cartera de los demás agentes la ve la gerencia.
        </div>
      )}

      {/* Resumen: lo que hay en juego y lo que ya tocaba llamar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-gray-400">En juego</p>
          <p className="text-xl font-black text-gray-900">{money(pipeline)}</p>
          <p className="text-[11px] font-bold text-gray-400">{abiertos.length} abierto(s)</p>
        </div>
        <button onClick={() => { setOnlyDue(true); setStatus('abiertos'); }}
          className={`bg-white border rounded-2xl px-4 py-3 text-left ${
            (summary?.overdue ?? 0) > 0 ? 'border-red-300' : 'border-gray-200'}`}>
          <p className="text-xs font-bold text-gray-400">Sin llamar (vencidos)</p>
          <p className={`text-xl font-black ${(summary?.overdue ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {summary?.overdue ?? 0}
          </p>
          <p className="text-[11px] font-bold text-gray-400">Tocá para verlos</p>
        </button>
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-gray-400">Para hoy</p>
          <p className="text-xl font-black text-gray-900">{summary?.today ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-gray-400">Ganados</p>
          <p className="text-xl font-black text-emerald-700">{summary?.by_status?.ganado?.count ?? 0}</p>
          <p className="text-[11px] font-bold text-gray-400">
            {money(summary?.by_status?.ganado?.amount ?? 0)}
          </p>
        </div>
      </div>

      {/* Etapas */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {[{ id: 'abiertos', label: 'Abiertos' }, ...STAGES.map(s => ({ id: s.id as string, label: s.label })),
          { id: 'all', label: 'Todos' }].map(f => (
          <button key={f.id} onClick={() => { setStatus(f.id); setOnlyDue(false); }}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border ${
              status === f.id && !onlyDue ? 'bg-fuchsia-600 border-fuchsia-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
            {summary?.by_status?.[f.id] && (
              <span className="ml-1 opacity-70">{summary.by_status[f.id].count}</span>
            )}
          </button>
        ))}
        {onlyDue && (
          <button onClick={() => setOnlyDue(false)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black bg-red-600 text-white">
            Solo vencidos <X size={12} />
          </button>
        )}
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
          <TrendingUp size={44} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">No hay seguimientos en esta vista.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cada vez que alguien pregunte por un producto, anotalo acá y no se pierde.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map(l => {
            const wa = waNumber(l.phone);
            return (
              <div key={l.id} className={`bg-white border-2 rounded-2xl p-4 ${
                vencido(l) ? 'border-red-200' : 'border-gray-200'}`}>
                <button onClick={() => setOpenLead(l)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 truncate flex items-center gap-1.5">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${stageOf(l.status).cls}`}>
                          {stageOf(l.status).label}
                        </span>
                        {l.customer_name}
                      </p>
                      <p className="text-xs font-bold text-gray-400 truncate">
                        {l.number}
                        {l.agent_name ? ` · ${l.agent_name}` : ''}
                        {l.source ? ` · por ${l.source}` : ''}
                      </p>
                      {l.interest && (
                        <p className="text-[11px] font-semibold text-gray-600 mt-0.5 line-clamp-2">
                          Pide: {l.interest}
                        </p>
                      )}
                    </div>
                    {Number(l.estimated_amount) > 0 && (
                      <span className="text-lg font-black tabular-nums shrink-0">{money(l.estimated_amount)}</span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                    vencido(l) ? 'bg-red-100 text-red-700'
                      : l.next_follow_up === crToday() ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-500'}`}>
                    <CalendarDays size={10} className="inline" />{' '}
                    {l.next_follow_up
                      ? (vencido(l) ? `Debía llamarse ${day(l.next_follow_up)}` : `Próximo ${day(l.next_follow_up)}`)
                      : 'Sin próxima fecha'}
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">
                    Último contacto: {when(l.last_contact_at)}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                  {wa && (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black hover:bg-emerald-100">
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  {l.phone && (
                    <a href={`tel:${l.phone}`}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-black hover:bg-gray-50">
                      <Phone size={13} /> Llamar
                    </a>
                  )}
                  <button onClick={() => setOpenLead(l)}
                    className="flex-1 min-w-[130px] py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-black">
                    Registrar contacto
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <LeadEditor
          agents={agents}
          customers={customers}
          myAgent={myAgent}
          lockAgent={!esGerencia}
          onClose={() => setCreating(false)}
          onSaved={l => {
            setCreating(false);
            setMsg({ kind: 'ok', text: `Seguimiento ${l.number} creado` });
            void load();
          }}
        />
      )}

      {openLead && (
        <LeadDetail
          lead={openLead}
          canDelete={esGerencia}
          onClose={() => setOpenLead(null)}
          onChanged={() => { void load(); }}
          onDeleted={() => { setOpenLead(null); void load(); }}
        />
      )}
    </div>
  );
};

/** Alta del interesado. */
const LeadEditor: React.FC<{
  agents: SalesAgent[];
  customers: Customer[];
  myAgent: { id: string; name: string } | null;
  lockAgent: boolean;
  onClose: () => void;
  onSaved: (l: Lead) => void;
}> = ({ agents, customers, myAgent, lockAgent, onClose, onSaved }) => {
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Lo que registra un agente queda a su nombre: si no, nace sin dueño y no lo
  // ve ni él mismo.
  const [agentId, setAgentId] = useState(myAgent?.id ?? '');
  useEffect(() => { if (myAgent?.id) setAgentId(prev => prev || myAgent.id); }, [myAgent]);
  const [source, setSource] = useState('whatsapp');
  const [interest, setInterest] = useState('');
  const [amount, setAmount] = useState('');
  const [next, setNext] = useState(crToday());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find(x => x.id === id);
    if (c) {
      setName(c.name);
      setPhone(c.phone ?? '');
      setEmail(c.email ?? '');
    }
  };

  const save = async () => {
    if (!name.trim()) { setError('Poné al menos el nombre de quien está preguntando.'); return; }
    setSaving(true); setError(null);
    try {
      const agent = agents.find(a => a.id === agentId);
      const saved = await leadsService.create({
        customer_id: customerId || null,
        customer_name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        zone: customers.find(c => c.id === customerId)?.zone ?? null,
        agent_id: agentId || null,
        agent_name: agent?.name ?? null,
        source,
        interest: interest.trim() || null,
        estimated_amount: Number(amount) || 0,
        next_follow_up: next || null,
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">Nuevo interesado</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2.5">
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1">¿Ya es cliente?</p>
            <select value={customerId} onChange={e => pickCustomer(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800">
              <option value="">No está en la lista (escribir a mano)</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Nombre de quien pregunta"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800" />

          <div className="flex items-center gap-2">
            <span className="relative flex-1 min-w-0">
              <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono" inputMode="tel"
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            </span>
            <span className="relative flex-1 min-w-0">
              <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo" inputMode="email"
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            </span>
          </div>

          <textarea value={interest} onChange={e => setInterest(e.target.value)} rows={2}
            placeholder="¿Qué está pidiendo? Ej. 20 sacos de cemento y varilla #3"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-black text-gray-500 uppercase mb-1">Llegó por</p>
              <select value={source} onChange={e => setSource(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800">
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-black text-gray-500 uppercase mb-1">Lo atiende</p>
              <select value={agentId} onChange={e => setAgentId(e.target.value)}
                disabled={lockAgent && !!myAgent}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 disabled:bg-gray-100">
                <option value="">Sin asignar</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                {myAgent && !agents.some(a => a.id === myAgent.id) && (
                  <option value={myAgent.id}>{myAgent.name}</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-black text-gray-500 uppercase mb-1">Monto estimado</p>
              <input type="number" min={0} step="any" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800" />
            </div>
            <div>
              <p className="text-xs font-black text-gray-500 uppercase mb-1">Volver a contactar</p>
              <input type="date" value={next} onChange={e => setNext(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <button onClick={() => void save()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar seguimiento
          </button>
        </div>
      </div>
    </div>
  );
};

/** Historia del seguimiento + registrar el siguiente contacto. */
const LeadDetail: React.FC<{
  lead: Lead;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}> = ({ lead, canDelete, onClose, onChanged, onDeleted }) => {
  const [full, setFull] = useState<Lead | null>(null);
  const [kind, setKind] = useState('llamada');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [newStatus, setNewStatus] = useState<LeadStatus | ''>('');
  const [lostReason, setLostReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    leadsService.get(lead.id).then(setFull).catch(() => setFull(lead));
  }, [lead]);
  useEffect(() => { reload(); }, [reload]);

  const l = full ?? lead;
  const wa = waNumber(l.phone);

  const addInteraction = async () => {
    if (!note.trim() && !newStatus) { setError('Escribí qué pasó en el contacto.'); return; }
    setBusy(true); setError(null);
    try {
      await leadsService.addInteraction(l.id, {
        kind, note: note.trim() || null,
        next_follow_up: next || null,
        ...(newStatus ? { status: newStatus } : {}),
      });
      setNote(''); setNext(''); setNewStatus('');
      reload(); onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el contacto');
    } finally { setBusy(false); }
  };

  const close = async (status: 'ganado' | 'perdido') => {
    if (status === 'perdido' && !lostReason.trim()) {
      setError('Poné por qué se perdió: es lo único que sirve para no repetirlo.');
      return;
    }
    setBusy(true); setError(null);
    try {
      await leadsService.close(l.id, { status, lost_reason: lostReason.trim() || null });
      reload(); onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`¿Borrar el seguimiento de ${l.customer_name}? Se pierde toda su historia.`)) return;
    try { await leadsService.remove(l.id); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar'); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800 min-w-0">
            <span className={`mr-1.5 text-[10px] font-black px-1.5 py-0.5 rounded ${stageOf(l.status).cls}`}>
              {stageOf(l.status).label}
            </span>
            {l.customer_name}
            <span className="block text-xs font-bold text-gray-400 truncate">
              {l.number}{l.agent_name ? ` · ${l.agent_name}` : ''}
            </span>
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          <div className="text-xs font-bold text-gray-600 space-y-1">
            {l.interest && <p className="text-gray-800">Pide: {l.interest}</p>}
            {Number(l.estimated_amount) > 0 && <p>Estimado: {money(l.estimated_amount)}</p>}
            <p className="flex items-center gap-2 flex-wrap">
              {l.phone && (
                <>
                  {wa && (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700">
                      <MessageCircle size={11} /> {l.phone}
                    </a>
                  )}
                  <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-sky-700">
                    <Phone size={11} /> Llamar
                  </a>
                </>
              )}
              {l.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {l.email}</span>}
              {l.zone && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {l.zone}</span>}
            </p>
            <p className="flex items-center gap-1">
              <Clock size={11} /> Último contacto: {when(l.last_contact_at)}
              {l.next_follow_up && ` · próximo ${day(l.next_follow_up)}`}
            </p>
            {l.status === 'perdido' && l.lost_reason && (
              <p className="text-red-700">Se perdió: {l.lost_reason}</p>
            )}
          </div>

          {/* Registrar el contacto de hoy */}
          {l.status !== 'ganado' && l.status !== 'perdido' && (
            <div className="border-2 border-fuchsia-100 bg-fuchsia-50/40 rounded-xl p-2.5 space-y-2">
              <p className="text-xs font-black text-fuchsia-800">Registrar contacto</p>
              <div className="flex items-center gap-2">
                <select value={kind} onChange={e => setKind(e.target.value)}
                  className="px-2 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 bg-white">
                  {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value as LeadStatus | '')}
                  className="flex-1 min-w-0 px-2 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 bg-white">
                  <option value="">Dejar la etapa como está</option>
                  {STAGES.filter(s => s.id !== 'ganado' && s.id !== 'perdido')
                    .map(s => <option key={s.id} value={s.id}>Pasar a {s.label}</option>)}
                </select>
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="¿Qué pasó? Ej. le pasé precio de la varilla, lo piensa hasta el jueves"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 bg-white" />
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-gray-500 uppercase shrink-0">Volver a contactar</span>
                <input type="date" value={next} onChange={e => setNext(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 bg-white" />
              </div>
              <button onClick={() => void addInteraction()} disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black text-sm disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar contacto
              </button>

              <div className="flex items-center gap-2 pt-1 border-t border-fuchsia-100">
                <button onClick={() => void close('ganado')} disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-50">
                  Se concretó la venta
                </button>
                <input value={lostReason} onChange={e => setLostReason(e.target.value)}
                  placeholder="Motivo si se perdió"
                  className="flex-1 min-w-0 px-2 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 bg-white" />
                <button onClick={() => void close('perdido')} disabled={busy}
                  className="px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-black hover:bg-red-50 disabled:opacity-50">
                  Perdido
                </button>
              </div>
            </div>
          )}

          {/* Historia */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1.5 flex items-center gap-1.5">
              <User size={13} /> Historia ({l.interactions?.length ?? 0})
            </p>
            {(l.interactions ?? []).length === 0 ? (
              <p className="text-xs font-bold text-gray-400">Sin contactos registrados.</p>
            ) : (
              <ul className="space-y-2">
                {(l.interactions ?? []).map(i => (
                  <li key={i.id} className="border-l-2 border-gray-200 pl-3">
                    <p className="text-xs font-black text-gray-800">
                      {KINDS.find(k => k.id === i.kind)?.label ?? i.kind}
                      {i.status_after && (
                        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded ${stageOf(i.status_after).cls}`}>
                          {stageOf(i.status_after).label}
                        </span>
                      )}
                    </p>
                    {i.note && <p className="text-[11px] font-semibold text-gray-600">{i.note}</p>}
                    <p className="text-[10px] font-bold text-gray-400">
                      {when(i.happened_at)}
                      {i.next_follow_up ? ` · próximo ${day(i.next_follow_up)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          {canDelete ? (
            <button onClick={() => void remove()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-red-600 font-black text-sm hover:bg-red-50">
              <Trash2 size={15} /> Borrar seguimiento
            </button>
          ) : (
            <p className="text-[11px] font-semibold text-gray-400 text-center">
              Si no se concretó, marcalo como perdido con su motivo. Borrarlo lo hace la gerencia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadsDashboard;
