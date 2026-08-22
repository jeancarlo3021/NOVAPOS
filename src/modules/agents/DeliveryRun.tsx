import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Home, Loader2, RefreshCw, ChevronLeft, ChevronRight, MapPin, Clock,
  User, Phone, CheckCircle2, AlertCircle, Pencil, CreditCard, PackageCheck,
  MessageCircle, Mail, IdCard, StickyNote, Navigation, ClipboardList, Circle,
  Ban, Receipt, History, FileText,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { usersService } from '@/services/users/usersService';
import type { User as AppUser } from '@/types/Types_Users';
import {
  agentOrdersService, salesAgentsService,
  type AgentOrder, type SalesAgent,
} from '@/services/agents/salesAgentsService';
import { OrderItemsEditor } from './OrderItemsEditor';
import { agendaTasksService, type AgendaTask } from '@/services/agents/agendaTasksService';
import { TaskPhotos } from './TaskEditor';
import { customersService, type Customer } from '@/services/customers/customersService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const shiftDay = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : null);
/** Número listo para wa.me: solo dígitos y con código de país (CR por defecto). */
const waNumber = (phone?: string | null) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 8) return `506${digits}`;      // número tico sin código
  if (digits.startsWith('00')) return digits.slice(2); // 00 + país
  return digits;
};

const longDay = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Ruta del día: las entregas de UN responsable, en orden de hora.
 *
 * Es la pantalla del que sale a repartir. Al llegar donde el cliente ajusta el
 * pedido si no se queda con todo, y cuando termina lo manda a caja para que se
 * cobre — el cobro sigue siendo del cajero, acá no se toca dinero.
 */
export const DeliveryRun: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenantId } = useTenantId();

  const [day, setDay] = useState(crToday());
  // El repartidor ve SOLO lo suyo: la ruta de otro no es asunto suyo y con la
  // lista completa se arriesga a entregar un pedido que no le tocaba.
  const canSeeAll = ['owner', 'admin', 'gerente'].includes(String(user?.role ?? ''));
  const [person, setPerson] = useState<string>(user?.id ?? '');
  useEffect(() => { if (!canSeeAll && user?.id) setPerson(user.id); }, [canSeeAll, user?.id]);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  // Las tareas del día van en la MISMA lista que las entregas: el que sale a la
  // calle hace las dos cosas en el mismo viaje, y verlas por separado es cómo se
  // olvida el mandado.
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentOrder | null>(null);
  /** Lo que no se pudo entregar/hacer, esperando el motivo. */
  const [rejecting, setRejecting] = useState<{ kind: 'order' | 'task'; id: string; label: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const [us, ags] = await Promise.all([
        usersService.getAllUsers(tenantId).catch(() => [] as AppUser[]),
        salesAgentsService.list().catch(() => [] as SalesAgent[]),
      ]);
      setPeople([
        ...us.map(u => ({ id: u.id, name: u.full_name || u.email })),
        ...ags.filter(a => a.is_active && !us.some(u => u.id === a.user_id))
              .map(a => ({ id: a.id, name: a.name })),
      ]);
    })();
  }, [tenantId]);

  // Datos completos del cliente: la ruta necesita cédula, correo, dirección y
  // notas, y el pedido solo guarda nombre y teléfono.
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  useEffect(() => {
    const ids = [...new Set(orders.map(o => o.customer_id).filter(Boolean))] as string[];
    const missing = ids.filter(id => !customers[id]);
    if (!missing.length) return;
    void (async () => {
      const got = await Promise.all(missing.map(id =>
        customersService.get(id).then(c => [id, c] as const).catch(() => null)));
      const add: Record<string, Customer> = {};
      for (const g of got) if (g) add[g[0]] = g[1];
      if (Object.keys(add).length) setCustomers(prev => ({ ...prev, ...add }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await agentOrdersService.list('all', undefined, {
        date: day, ...(person ? { assigned_to: person } : {}),
      });
      setOrders(rows.filter(o => o.status !== 'cancelled'));
      const ts = await agendaTasksService.list({
        date: day, ...(person ? { assigned_to: person } : {}),
      }).catch(() => [] as AgendaTask[]);
      setTasks(ts.filter(t => t.status !== 'cancelled'));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar la ruta' });
    } finally { setLoading(false); }
  }, [day, person]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 3000 : 6000);
    return () => clearTimeout(t);
  }, [msg]);

  /** Terminada la entrega, el pedido se reserva y se abre en caja para cobrar. */
  const finish = async (o: AgentOrder) => {
    setBusyId(o.id);
    try {
      // Se toma acá para que el pedido llegue a caja ya reservado: si no, otro
      // cajero podía cobrarlo mientras el repartidor iba de camino.
      if (o.status === 'pending') await agentOrdersService.take(o.id);
      navigate(`/caja?order=${o.id}`);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo enviar a caja' });
      void load();
    } finally { setBusyId(null); }
  };

  const toggleTask = async (t: AgendaTask) => {
    setBusyId(t.id);
    try {
      const upd = await agendaTasksService.setStatus(t.id, t.status === 'done' ? 'pending' : 'done');
      setTasks(prev => prev.map(x => (x.id === t.id ? upd : x)));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo marcar la tarea' });
    } finally { setBusyId(null); }
  };

  const reject = async (reason: string) => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      if (rejecting.kind === 'order') await agentOrdersService.reject(rejecting.id, reason);
      else await agendaTasksService.reject(rejecting.id, reason);
      setMsg({ kind: 'ok', text: `${rejecting.label}: quedó pendiente de reprogramar en la agenda.` });
      setRejecting(null);
      void load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo registrar' });
    } finally { setBusyId(null); }
  };

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (a.scheduled_time ?? '99').localeCompare(b.scheduled_time ?? '99')),
    [orders]);
  const pend = sorted.filter(o => o.status !== 'charged');
  const done = sorted.filter(o => o.status === 'charged');
  const total = pend.reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <div className="min-h-screen overflow-y-auto no-scrollbar bg-gray-100 p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <Truck size={20} className="text-indigo-600" /> Entregas del día
        </span>
        <div className="hidden sm:block flex-1" />
        {canSeeAll ? (
          <select value={person} onChange={e => setPerson(e.target.value)}
            className="flex-1 sm:flex-none min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
            <option value="">Todas las entregas</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-sm font-black text-indigo-800">
            <User size={15} /> Mi ruta
          </span>
        )}
        <button onClick={() => void load()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
      </div>

      {/* Día */}
      <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2.5 flex items-center gap-2 flex-wrap">
        <button onClick={() => setDay(d => shiftDay(d, -1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronLeft size={15} className="text-gray-500" />
        </button>
        <input type="date" value={day} onChange={e => setDay(e.target.value || crToday())}
          className="flex-1 sm:flex-none min-w-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-sm font-black text-gray-800" />
        <button onClick={() => setDay(d => shiftDay(d, 1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronRight size={15} className="text-gray-500" />
        </button>
        <button onClick={() => setDay(crToday())}
          className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
            day === crToday() ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Hoy
        </button>
        <span className="hidden sm:inline text-xs font-bold text-gray-400 capitalize">{longDay(day)}</span>
        <span className="w-full sm:w-auto sm:ml-auto text-xs font-black text-gray-700">
          {pend.length} por entregar · {money(total)}
          {tasks.filter(t => t.status !== 'done').length > 0 &&
            ` · ${tasks.filter(t => t.status !== 'done').length} tarea(s)`}
          {done.length > 0 && <span className="text-emerald-600"> · {done.length} cobradas</span>}
        </span>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      {/* Tareas del día */}
      {tasks.length > 0 && (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-3">
          <p className="flex items-center gap-1.5 text-xs font-black text-amber-800 mb-2">
            <ClipboardList size={14} /> Tareas del día
            <span className="text-[11px] font-bold text-amber-600">
              {tasks.filter(t => t.status === 'done').length}/{tasks.length} hechas
            </span>
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto no-scrollbar">
            {[...tasks]
              .sort((a, b) => (a.scheduled_time ?? '99').localeCompare(b.scheduled_time ?? '99'))
              .map(t => (
              <div key={t.id} className={`flex items-start gap-2 rounded-xl border p-2.5 ${
                t.status === 'done' ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200'}`}>
                <button onClick={() => void toggleTask(t)} disabled={busyId === t.id}
                  title={t.status === 'done' ? 'Marcar como pendiente' : 'Marcar como realizada'}
                  className="shrink-0 mt-0.5">
                  {busyId === t.id ? <Loader2 size={20} className="animate-spin text-gray-400" />
                    : t.status === 'done'
                      ? <CheckCircle2 size={20} className="text-emerald-600" />
                      : <Circle size={20} className="text-gray-300" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black truncate ${
                    t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    <span className={`mr-1.5 text-[10px] font-black px-1.5 py-0.5 rounded ${
                      t.scheduled_time ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-400'}`}>
                      {hhmm(t.scheduled_time) ?? 'Sin hora'}
                    </span>
                    {t.title}
                  </p>
                  {t.places?.length > 0 && (
                    <p className="text-[11px] font-bold text-emerald-700 flex items-start gap-1">
                      <MapPin size={10} className="shrink-0 mt-0.5" />
                      <span className="min-w-0">{t.places.map(pl => pl.name).filter(Boolean).join(' → ')}</span>
                    </p>
                  )}
                  {t.notes && (
                    <p className="text-[11px] font-semibold text-gray-500 truncate">↳ {t.notes}</p>
                  )}
                  {t.needs_reschedule && t.reject_reason && (
                    <p className="text-[11px] font-black text-red-700 flex items-start gap-1">
                      <Ban size={11} className="shrink-0 mt-0.5" />
                      <span className="min-w-0">No se pudo antes: {t.reject_reason}</span>
                    </p>
                  )}
                  <TaskPhotos photos={t.photos ?? []} />
                </div>
                {t.status !== 'done' && (
                  <button onClick={() => setRejecting({ kind: 'task', id: t.id, label: t.title })}
                    disabled={busyId === t.id} title="No se pudo hacer: queda para reprogramar"
                    className="shrink-0 p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">
                    <Ban size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-gray-400">
          <Loader2 size={18} className="animate-spin" /> Cargando ruta…
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-16">
          <Truck size={44} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">
            {tasks.length > 0 ? 'Solo hay tareas este día, sin entregas.' : 'No hay entregas asignadas este día.'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Se asignan desde la Agenda de entregas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sorted.map(o => (
            <div key={o.id} className={`bg-white border-2 rounded-2xl p-4 ${
              o.status === 'charged' ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-gray-900 flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-black px-1.5 py-0.5 rounded ${
                      o.scheduled_time ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-400'}`}>
                      <Clock size={10} /> {hhmm(o.scheduled_time) ?? 'Sin hora'}
                    </span>
                    {o.number ?? 'Pedido'}
                    {o.status === 'charged' && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">
                        COBRADO
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-bold text-gray-600 truncate mt-0.5">
                    {o.customer_name ?? 'Sin cliente'}
                  </p>
                  <CustomerBlock order={o} customer={o.customer_id ? customers[o.customer_id] : undefined} />
                  {o.assigned_name && (
                    <p className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                      <User size={11} /> {o.assigned_name}
                    </p>
                  )}
                  {o.scheduled_note && (
                    <p className="text-[11px] font-semibold text-amber-700 truncate">↳ {o.scheduled_note}</p>
                  )}
                </div>
                <span className="text-xl font-black tabular-nums shrink-0">{money(o.total)}</span>
              </div>

              <ul className="mt-3 text-xs text-gray-600 space-y-1">
                {o.items.map((it, i) => (
                  <li key={i}>
                    <span className="flex justify-between gap-2">
                      <span className="min-w-0">
                        <b className="text-gray-800">{it.quantity} ×</b> {it.product_name}
                      </span>
                      <span className="tabular-nums shrink-0">{money(it.subtotal)}</span>
                    </span>
                    <span className="block text-[11px] text-gray-400">
                      {money(it.unit_price)} c/u
                      {it.notes ? ` · ${it.notes}` : ''}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Todo lo demás que trae el pedido, sin abrir nada */}
              <div className="mt-2 space-y-1">
                {o.document_type && o.document_type !== 'ticket' && (
                  <p className="text-[11px] font-black text-blue-700 flex items-center gap-1">
                    <Receipt size={11} />
                    {o.document_type === 'factura_electronica' ? 'Pide FACTURA ELECTRÓNICA' : 'Pide TIQUETE ELECTRÓNICO'}
                  </p>
                )}
                {o.proforma_id && (
                  <p className="text-[11px] font-black text-violet-700 flex items-center gap-1">
                    <FileText size={11} /> Viene de una proforma
                  </p>
                )}
                {o.notes && (
                  <p className="text-[11px] font-semibold text-gray-600 flex items-start gap-1">
                    <StickyNote size={11} className="shrink-0 mt-0.5" />
                    <span className="min-w-0">{o.notes}</span>
                  </p>
                )}
                {o.needs_reschedule && o.reject_reason && (
                  <p className="text-[11px] font-black text-red-700 flex items-start gap-1">
                    <Ban size={11} className="shrink-0 mt-0.5" />
                    <span className="min-w-0">No se pudo antes: {o.reject_reason}</span>
                  </p>
                )}
                {!!o.reschedule_log?.length && (
                  <p className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                    <History size={11} /> Reprogramado {o.reschedule_log.length} vez(ces)
                  </p>
                )}
              </div>

              {o.status !== 'charged' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                  <button onClick={() => setEditing(o)} disabled={busyId === o.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-black text-sm hover:bg-gray-50 disabled:opacity-40">
                    <Pencil size={15} /> Ajustar
                  </button>
                  <button onClick={() => setRejecting({ kind: 'order', id: o.id, label: o.number ?? 'Pedido' })}
                    disabled={busyId === o.id}
                    title="No se pudo entregar: queda para reprogramar"
                    className="flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5 rounded-xl border-2 border-red-200 text-red-700 font-black text-sm hover:bg-red-50 disabled:opacity-40">
                    <Ban size={15} /> No se pudo
                  </button>
                  <button onClick={() => void finish(o)} disabled={busyId === o.id}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
                    {busyId === o.id ? <Loader2 size={15} className="animate-spin" />
                      : <><PackageCheck size={15} /> <CreditCard size={15} /></>}
                    Entregado → Caja
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <RejectDialog
          label={rejecting.label}
          busy={busyId === rejecting.id}
          onClose={() => setRejecting(null)}
          onConfirm={reject}
        />
      )}

      {editing && (
        <OrderItemsEditor
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={upd => {
            setOrders(prev => prev.map(x => (x.id === upd.id ? { ...x, ...upd } : x)));
            setEditing(null);
            setMsg({ kind: 'ok', text: `${upd.number ?? 'Pedido'} ajustado · nuevo total ${money(upd.total)}` });
          }}
        />
      )}
    </div>
  );
};

/**
 * Motivo por el que no se pudo.
 *
 * Se pide obligatorio: "no se pudo" sin razón no le sirve a quien reprograma, y
 * al día siguiente nadie se acuerda de por qué el pedido volvió.
 */
const RejectDialog: React.FC<{
  label: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ label, busy, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const QUICK = [
    'El cliente no estaba',
    'No había quien recibiera',
    'Local cerrado',
    'Faltó producto',
    'No alcanzó el tiempo',
    'Dirección incorrecta',
    'El cliente lo pidió para otro día',
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-black text-gray-800">
          ¿Por qué no se pudo?
          <span className="block text-xs font-bold text-gray-400">{label}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-black ${
                reason === r ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {r}
            </button>
          ))}
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
          placeholder="Escribí el motivo…"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />
        <button onClick={() => onConfirm(reason.trim())} disabled={busy || !reason.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
          Marcar como no realizado
        </button>
      </div>
    </div>
  );
};

/**
 * Ficha del cliente en la ruta.
 *
 * El repartidor necesita todo junto: a quién busca, cómo lo llama o le escribe,
 * a dónde va y qué advertencia hay. El teléfono abre WhatsApp directo porque es
 * como se avisa "voy llegando"; el ícono de al lado sigue siendo la llamada.
 */
const CustomerBlock: React.FC<{ order: AgentOrder; customer?: Customer }> = ({ order, customer }) => {
  const phone = order.customer_phone || customer?.phone || null;
  const wa = waNumber(phone);
  const place = [order.customer_zone || customer?.zone, order.delivery_place || customer?.address]
    .filter(Boolean).join(' · ');
  const maps = customer?.lat && customer?.lng
    ? `https://www.google.com/maps/search/?api=1&query=${customer.lat},${customer.lng}`
    : place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;

  return (
    <div className="space-y-0.5 mt-0.5">
      {(customer?.identification || customer?.commercial_name) && (
        <p className="text-[11px] font-bold text-gray-500 flex items-center gap-1 truncate">
          <IdCard size={11} className="shrink-0" />
          {[customer?.identification, customer?.commercial_name].filter(Boolean).join(' · ')}
        </p>
      )}

      {phone && (
        <span className="flex items-center gap-1.5">
          {wa ? (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-800 hover:bg-emerald-100">
              <MessageCircle size={11} /> {phone}
            </a>
          ) : (
            <span className="text-[11px] font-bold text-gray-500">{phone}</span>
          )}
          <a href={`tel:${phone}`} title="Llamar"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <Phone size={11} />
          </a>
        </span>
      )}

      {customer?.email && (
        <a href={`mailto:${customer.email}`}
          className="text-[11px] font-bold text-sky-700 flex items-center gap-1 truncate">
          <Mail size={11} className="shrink-0" /> {customer.email}
        </a>
      )}

      {place && (
        <p className="text-[11px] font-bold text-emerald-700 flex items-start gap-1">
          <MapPin size={11} className="shrink-0 mt-0.5" />
          <span className="min-w-0">{place}</span>
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" title="Abrir en el mapa"
              className="shrink-0 text-emerald-600 hover:text-emerald-800">
              <Navigation size={11} />
            </a>
          )}
        </p>
      )}

      {customer?.notes && (
        <p className="text-[11px] font-semibold text-gray-500 flex items-start gap-1">
          <StickyNote size={11} className="shrink-0 mt-0.5" />
          <span className="min-w-0">{customer.notes}</span>
        </p>
      )}

      {customer?.credit_enabled && (
        <span className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
          CLIENTE CON CRÉDITO
        </span>
      )}
    </div>
  );
};

export default DeliveryRun;
