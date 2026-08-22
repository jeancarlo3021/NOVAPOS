import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Home, Loader2, User, Truck,
  Clock, AlertCircle, CheckCircle2, X, ArrowRight, RefreshCw, History, Eye, Settings2, MapPin,
  ClipboardList, Plus, Circle, Trash2, Ban,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { usersService } from '@/services/users/usersService';
import type { User as AppUser } from '@/types/Types_Users';
import {
  agentOrdersService, salesAgentsService,
  type AgentOrder, type SalesAgent,
} from '@/services/agents/salesAgentsService';
import { agendaTasksService, type AgendaTask } from '@/services/agents/agendaTasksService';
import { TaskEditor, TaskPhotos } from './TaskEditor';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
/** Hoy en Costa Rica. El día del negocio no es el UTC del navegador. */
const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const shiftDay = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : null);
const longDay = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Franja del día a la que pertenece una hora HH:MM. */
const slotOf = (t?: string | null): 'am' | 'pm' | 'eve' | 'none' => {
  const hhmmStr = t ? String(t).slice(0, 5) : '';
  if (!hhmmStr) return 'none';
  const h = Number(hhmmStr.slice(0, 2));
  if (h < 12) return 'am';
  if (h < 17) return 'pm';
  return 'eve';
};

/** Hora a la que se agrupa una entrega en la lista ("09" o "sin"). */
const hourKey = (o: { scheduled_time?: string | null }) =>
  o.scheduled_time ? String(o.scheduled_time).slice(0, 2) : 'sin';

const SLOTS: Array<{ id: 'all' | 'am' | 'pm' | 'eve' | 'none'; label: string }> = [
  { id: 'all', label: 'Todo el día' },
  { id: 'am',  label: 'Mañana' },
  { id: 'pm',  label: 'Tarde' },
  { id: 'eve', label: 'Noche' },
  { id: 'none', label: 'Sin hora' },
];

/** Días del mes que contiene `anchor`, alineados a semana completa. */
function monthGrid(anchor: string): string[] {
  const a = new Date(anchor + 'T12:00:00');
  const first = new Date(a.getFullYear(), a.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return iso(d);
  });
}

/**
 * Agenda de entregas.
 *
 * Calendario del mes con lo que hay que entregar cada día, y el detalle del día
 * elegido: quién lo entrega, a qué hora, y los botones para trasladarlo de día
 * o posponer la hora. Los pedidos vienen de "Nuevo pedido" (agentes) y se cobran
 * en Caja; esto es la vista de PLANIFICACIÓN, no de cobro.
 */
export const DeliveryAgenda: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();

  const [anchor, setAnchor] = useState(crToday());       // mes visible
  const [day, setDay] = useState(crToday());             // día elegido
  const [agenda, setAgenda] = useState<Record<string, {
    date: string; pending: number; charged: number; total: number;
    unassigned?: number; people?: string[];
    first_time?: string | null; last_time?: string | null;
    zones?: string[];
  }>>({});
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [filterPerson, setFilterPerson] = useState('');
  const [filterZone, setFilterZone] = useState('');
  // Franja horaria: el día se trabaja por bloques, no de corrido. 'all' = todo,
  // 'none' = lo que todavía no tiene hora asignada.
  const [slot, setSlot] = useState<'all' | 'am' | 'pm' | 'eve' | 'none'>('all');
  // Dos vistas. "Solo horas" es la de mostrador: qué hay que entregar y a qué
  // hora, sin asignar a nadie — el responsable termina siendo quien haga el
  // ticket. "Gestión" es la de quien planifica la ruta.
  const [onlyHours, setOnlyHours] = useState(
    () => localStorage.getItem('agenda_only_hours') === '1');
  useEffect(() => {
    localStorage.setItem('agenda_only_hours', onlyHours ? '1' : '0');
  }, [onlyHours]);
  const [moving, setMoving] = useState<AgentOrder | null>(null);
  // Tareas del día (mandados, trámites): comparten el día con las entregas.
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [editingTask, setEditingTask] = useState<AgendaTask | null>(null);
  const [newTask, setNewTask] = useState(false);
  const [movingTask, setMovingTask] = useState<AgendaTask | null>(null);
  const [logOf, setLogOf] = useState<AgentOrder | null>(null);

  // Responsables posibles: usuarios del negocio + agentes de venta. Un repartidor
  // puede no tener usuario del sistema, por eso van los dos.
  const [people, setPeople] = useState<Array<{ id: string; name: string; kind: 'user' | 'agent' }>>([]);
  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const [us, ags] = await Promise.all([
        usersService.getAllUsers(tenantId).catch(() => [] as AppUser[]),
        salesAgentsService.list().catch(() => [] as SalesAgent[]),
      ]);
      const list = [
        ...us.map(u => ({ id: u.id, name: u.full_name || u.email, kind: 'user' as const })),
        ...ags.filter(a => a.is_active && !us.some(u => u.id === a.user_id))
              .map(a => ({ id: a.id, name: a.name, kind: 'agent' as const })),
      ];
      setPeople(list);
    })();
  }, [tenantId]);

  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const zonesOfMonth = useMemo(() => {
    const set = new Set<string>();
    for (const a of Object.values(agenda)) (a.zones ?? []).forEach(z => set.add(z));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [agenda]);
  const monthOf = (d: string) => d.slice(0, 7);

  const loadAgenda = useCallback(async () => {
    try {
      const rows = await agentOrdersService.agenda(grid[0], grid[grid.length - 1], filterPerson || undefined);
      const map: typeof agenda = {};
      for (const r of rows) map[r.date] = r;
      setAgenda(map);
    } catch { setAgenda({}); }
  }, [grid, filterPerson]);

  // La vista de solo horas no filtra por persona: muestra el día completo.
  useEffect(() => { if (onlyHours) setFilterPerson(''); }, [onlyHours]);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      // Todos los estados menos anulados: la agenda muestra también lo ya cobrado
      // del día, si no parece que no había nada que entregar.
      const rows = await agentOrdersService.list('all', undefined, {
        date: day, ...(filterPerson ? { assigned_to: filterPerson } : {}),
      });
      setOrders(rows.filter(o => o.status !== 'cancelled')
        .filter(o => !filterZone || o.customer_zone === filterZone));
      // Las tareas no dependen de la zona (un trámite no tiene zona de cliente).
      const ts = await agendaTasksService.list({
        date: day, ...(filterPerson ? { assigned_to: filterPerson } : {}),
      }).catch(() => [] as AgendaTask[]);
      setTasks(ts.filter(t => t.status !== 'cancelled'));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar el día' });
    } finally { setLoading(false); }
  }, [day, filterPerson, filterZone]);

  useEffect(() => { void loadAgenda(); }, [loadAgenda]);
  useEffect(() => { void loadDay(); }, [loadDay]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'ok' ? 3000 : 6000);
    return () => clearTimeout(t);
  }, [msg]);

  const refresh = () => { void loadAgenda(); void loadDay(); };

  const assign = async (o: AgentOrder, personId: string) => {
    const p = people.find(x => x.id === personId);
    setBusyId(o.id);
    try {
      await agentOrdersService.assign(o.id, personId || null, p?.name ?? null);
      setMsg({ kind: 'ok', text: personId ? `${o.number ?? 'Pedido'} → ${p?.name}` : 'Responsable quitado' });
      refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo asignar' });
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

  const moveTask = async (t: AgendaTask, date: string, time: string, reason: string) => {
    setBusyId(t.id);
    try {
      await agendaTasksService.schedule(t.id, {
        scheduled_date: date, scheduled_time: time || null, reason: reason.trim() || null,
      });
      setMsg({ kind: 'ok', text: `"${t.title}" pasó al ${longDay(date)}` });
      setMovingTask(null);
      refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo trasladar' });
    } finally { setBusyId(null); }
  };

  const removeTask = async (t: AgendaTask) => {
    if (!confirm(`¿Borrar la tarea "${t.title}"?`)) return;
    try {
      await agendaTasksService.remove(t.id);
      setTasks(prev => prev.filter(x => x.id !== t.id));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo borrar' });
    }
  };

  const savePlace = async (o: AgentOrder, patch: { customer_zone?: string; delivery_place?: string }) => {
    setBusyId(o.id);
    try {
      await agentOrdersService.setPlace(o.id, patch);
      refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo guardar el lugar' });
    } finally { setBusyId(null); }
  };

  const setTime = async (o: AgentOrder, time: string) => {
    setBusyId(o.id);
    try {
      await agentOrdersService.schedule(o.id, { scheduled_time: time || null });
      refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cambiar la hora' });
    } finally { setBusyId(null); }
  };

  /** Posponer: corre la hora N minutos sobre la que ya tenía (o sobre ahora). */
  const postpone = async (o: AgentOrder, minutes: number) => {
    const base = o.scheduled_time
      ? new Date(`${o.scheduled_date ?? day}T${String(o.scheduled_time).slice(0, 8)}`)
      : new Date();
    base.setMinutes(base.getMinutes() + minutes);
    const newDay = base.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
    const newTime = base.toTimeString().slice(0, 5);
    setBusyId(o.id);
    try {
      // Si al posponer se pasa de medianoche, el pedido cambia de día también.
      await agentOrdersService.schedule(o.id, {
        scheduled_time: newTime,
        ...(newDay !== o.scheduled_date ? { scheduled_date: newDay } : {}),
        reason: `Pospuesto ${minutes} min`,
      });
      setMsg({ kind: 'ok', text: `${o.number ?? 'Pedido'} pospuesto a las ${newTime}` });
      refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo posponer' });
    } finally { setBusyId(null); }
  };

  const move = async (o: AgentOrder, date: string, time: string, reason: string) => {
    setBusyId(o.id);
    try {
      await agentOrdersService.schedule(o.id, {
        scheduled_date: date, scheduled_time: time || null, reason: reason.trim() || null,
      });
      setMsg({ kind: 'ok', text: `${o.number ?? 'Pedido'} movido al ${longDay(date)}` });
      setMoving(null);
      refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo trasladar' });
    } finally { setBusyId(null); }
  };

  // Entregas que se están viendo: filtro de franja + orden por hora. Las que no
  // tienen hora van al final: no compiten con lo que sí está agendado.
  const visibleOrders = useMemo(() => (
    orders
      .filter(o => slot === 'all' || slotOf(o.scheduled_time) === slot)
      .sort((a, b) => (hhmm(a.scheduled_time) ?? '99:99').localeCompare(hhmm(b.scheduled_time) ?? '99:99'))
  ), [orders, slot]);

  // Entregas y tareas que volvieron sin hacer: la agenda tiene que pedirles
  // fecha, si no se quedan enterradas en el día que ya pasó.
  const pendingReschedule = useMemo(() => ([
    ...orders.filter(o => o.needs_reschedule).map(o => ({
      kind: 'order' as const, id: o.id,
      label: `${o.number ?? 'Pedido'}${o.customer_name ? ` · ${o.customer_name}` : ''}`,
      reason: o.reject_reason ?? 'sin motivo',
    })),
    ...tasks.filter(t => t.needs_reschedule).map(t => ({
      kind: 'task' as const, id: t.id, label: t.title,
      reason: t.reject_reason ?? 'sin motivo',
    })),
  ]), [orders, tasks]);

  const dayTotal = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const sinAsignar = orders.filter(o => !o.assigned_to).length;
  // Franja horaria del día: de la primera entrega a la última.
  const dayRange = (() => {
    const ts = orders.map(o => hhmm(o.scheduled_time)).filter(Boolean).sort() as string[];
    if (!ts.length) return null;
    return ts[0] === ts[ts.length - 1] ? ts[0] : `${ts[0]} a ${ts[ts.length - 1]}`;
  })();

  return (
    <div className="min-h-screen overflow-y-auto no-scrollbar bg-gray-100 p-3 sm:p-6 space-y-3 sm:space-y-4">
      {/* Cabecera */}
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <CalendarDays size={20} className="text-amber-600" /> Agenda de entregas
        </span>
        <div className="hidden sm:block flex-1" />
        <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
          <button onClick={() => setOnlyHours(true)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-black transition ${
              onlyHours ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            <Eye size={15} /> Solo horas
          </button>
          <button onClick={() => setOnlyHours(false)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-black transition ${
              !onlyHours ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            <Settings2 size={15} /> Gestión
          </button>
        </div>
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          className="flex-1 sm:flex-none min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
          <option value="">Todas las zonas</option>
          {zonesOfMonth.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {!onlyHours && (
          <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
            className="flex-1 sm:flex-none min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
            <option value="">Todos los responsables</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button onClick={refresh} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        {/* ── Calendario del mes ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-2 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setAnchor(a => {
              const d = new Date(a + 'T12:00:00'); d.setMonth(d.getMonth() - 1); return iso(d);
            })} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <span className="text-base font-black text-gray-800 capitalize">
              {new Date(anchor + 'T12:00:00').toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setAnchor(crToday()); setDay(crToday()); }}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50">
                Hoy
              </button>
              <button onClick={() => setAnchor(a => {
                const d = new Date(a + 'T12:00:00'); d.setMonth(d.getMonth() + 1); return iso(d);
              })} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[11px] font-black text-gray-400 py-1">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map(d => {
              const a = agenda[d];
              const otherMonth = monthOf(d) !== monthOf(anchor);
              const isToday = d === crToday();
              const isSel = d === day;
              return (
                <button key={d} onClick={() => setDay(d)}
                  className={`min-h-[58px] sm:min-h-[74px] rounded-lg sm:rounded-xl border-2 p-1 sm:p-1.5 text-left transition ${
                    isSel ? 'border-amber-500 bg-amber-50'
                      : isToday ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-gray-100 hover:border-gray-300'} ${otherMonth ? 'opacity-40' : ''}`}>
                  <span className={`block text-xs font-black ${isToday ? 'text-emerald-700' : 'text-gray-700'}`}>
                    {Number(d.slice(8, 10))}
                  </span>
                  {a && (a.pending + a.charged) > 0 && (
                    <span className="block mt-0.5 space-y-0.5">
                      <span className="block text-[10px] font-black text-gray-800">
                        <span className="sm:hidden">{a.pending + a.charged} ent.</span>
                        <span className="hidden sm:inline">
                          {a.pending + a.charged} entrega{a.pending + a.charged === 1 ? '' : 's'}
                        </span>
                      </span>
                      {a.first_time && (
                        <span className="block text-[10px] font-black text-sky-700 truncate">
                          {a.first_time}{a.last_time && a.last_time !== a.first_time ? `–${a.last_time}` : ''}
                        </span>
                      )}
                      <span className="hidden sm:block text-[10px] font-bold text-gray-400 truncate">{money(a.total)}</span>
                      {!onlyHours && !!a.unassigned && (
                        <span className="inline-block text-[9px] font-black px-1 rounded bg-red-100 text-red-700">
                          {a.unassigned} sin asignar
                        </span>
                      )}
                      {!!a.zones?.length && (
                        <span className="hidden sm:block text-[9px] font-bold text-emerald-700 truncate">
                          {a.zones.join(' · ')}
                        </span>
                      )}
                      {!onlyHours && !!a.people?.length && (
                        <span className="hidden sm:block text-[9px] font-bold text-sky-700 truncate">
                          {a.people.join(', ')}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Detalle del día ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900 capitalize truncate">{longDay(day)}</p>
              <p className="text-xs font-bold text-gray-400">
                {orders.length} entrega(s) · {money(dayTotal)}
                {dayRange && <span className="text-sky-700"> · {dayRange}</span>}
                {!onlyHours && sinAsignar > 0 && (
                  <span className="text-red-600"> · {sinAsignar} sin responsable</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setDay(d => shiftDay(d, -1))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                <ChevronLeft size={15} className="text-gray-500" />
              </button>
              <button onClick={() => setDay(d => shiftDay(d, 1))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                <ChevronRight size={15} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Alerta: lo que no se pudo entregar/hacer y sigue sin fecha nueva. */}
          {pendingReschedule.length > 0 && (
            <div className="border-2 border-red-200 bg-red-50 rounded-xl p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-black text-red-800">
                <Ban size={14} /> {pendingReschedule.length} sin reprogramar
              </p>
              <div className="space-y-1.5 mt-2 max-h-[24vh] overflow-y-auto no-scrollbar">
                {pendingReschedule.map(r => (
                  <div key={r.id} className="flex items-start gap-2 bg-white rounded-lg border border-red-200 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-gray-800 truncate">{r.label}</p>
                      <p className="text-[11px] font-bold text-red-700 truncate">
                        No se pudo: {r.reason}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (r.kind === 'order') {
                          const o = orders.find(x => x.id === r.id);
                          if (o) setMoving(o);
                        } else {
                          const t = tasks.find(x => x.id === r.id);
                          if (t) setMovingTask(t);
                        }
                      }}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-black">
                      <ArrowRight size={12} /> Reprogramar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tareas del día (mandados, trámites) ── */}
          <div className="border-2 border-amber-100 bg-amber-50/40 rounded-xl p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                <ClipboardList size={14} /> Tareas del día
                {tasks.length > 0 && (
                  <span className="text-[11px] font-bold text-amber-600">
                    {tasks.filter(t => t.status === 'done').length}/{tasks.length} hechas
                  </span>
                )}
              </span>
              <button onClick={() => setNewTask(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black">
                <Plus size={13} /> Nueva
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-[11px] font-bold text-amber-700/60 py-2">
                Sin tareas este día. Ej. "ir a la encomienda", "pasar al banco".
              </p>
            ) : (
              <div className="space-y-1.5 mt-2 max-h-[38vh] overflow-y-auto no-scrollbar">
                {tasks.map(t => (
                  <div key={t.id} className={`rounded-lg border bg-white p-2 ${
                    t.status === 'done' ? 'border-emerald-200' : 'border-amber-200'}`}>
                    <div className="flex items-start gap-2">
                      {/* Marcar realizado / pendiente */}
                      <button onClick={() => void toggleTask(t)} disabled={busyId === t.id}
                        title={t.status === 'done' ? 'Marcar como pendiente' : 'Marcar como realizada'}
                        className="shrink-0 mt-0.5">
                        {busyId === t.id ? <Loader2 size={18} className="animate-spin text-gray-400" />
                          : t.status === 'done'
                            ? <CheckCircle2 size={18} className="text-emerald-600" />
                            : <Circle size={18} className="text-gray-300" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-black truncate ${
                          t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                          {t.scheduled_time && (
                            <span className="mr-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                              {hhmm(t.scheduled_time)}
                            </span>
                          )}
                          {t.title}
                        </p>
                        {t.assigned_name && (
                          <p className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                            <User size={10} /> {t.assigned_name}
                          </p>
                        )}
                        {t.places?.length > 0 && (
                          <p className="text-[11px] font-bold text-emerald-700 flex items-start gap-1">
                            <MapPin size={10} className="shrink-0 mt-0.5" />
                            <span className="min-w-0">
                              {t.places.map(pl => pl.name).filter(Boolean).join(' → ')}
                            </span>
                          </p>
                        )}
                        {t.notes && (
                          <p className="text-[11px] font-semibold text-gray-500 truncate">↳ {t.notes}</p>
                        )}
                        {t.needs_reschedule && (
                          <p className="text-[11px] font-black text-red-700 flex items-start gap-1">
                            <Ban size={11} className="shrink-0 mt-0.5" />
                            <span className="min-w-0">Sin reprogramar: {t.reject_reason ?? 'no se pudo hacer'}</span>
                          </p>
                        )}
                        <TaskPhotos photos={t.photos ?? []} />
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setMovingTask(t)} title="Pasar a otro día"
                          className="p-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50">
                          <ArrowRight size={13} />
                        </button>
                        <button onClick={() => setEditingTask(t)} title="Editar"
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                          <Settings2 size={13} />
                        </button>
                        <button onClick={() => void removeTask(t)} title="Borrar"
                          className="p-1.5 rounded-lg border border-gray-200 text-red-500 hover:bg-red-50">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Franjas horarias: cada botón dice cuántas entregas caen en ella. */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {SLOTS.map(sl => {
              const n = sl.id === 'all'
                ? orders.length
                : orders.filter(o => slotOf(o.scheduled_time) === sl.id).length;
              return (
                <button key={sl.id} onClick={() => setSlot(sl.id)}
                  disabled={n === 0 && sl.id !== 'all'}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition ${
                    slot === sl.id ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'} ${
                    n === 0 && sl.id !== 'all' ? 'opacity-40' : ''}`}>
                  {sl.label} {n > 0 && <span className="opacity-80">({n})</span>}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Cargando…
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="text-center py-12">
              <Truck size={40} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm font-bold text-gray-400">
                {orders.length === 0 ? 'No hay entregas este día.' : 'No hay entregas en esta franja.'}
              </p>
              {orders.length > 0 && (
                <button onClick={() => setSlot('all')}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50">
                  Ver todo el día
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[55vh] xl:max-h-[62vh] overflow-y-auto no-scrollbar pr-1">
              {visibleOrders.map((o, idx) => (
                <React.Fragment key={o.id}>
                {/* Separador de hora: agrupa la lista para leerla de un vistazo. */}
                {(idx === 0 || hourKey(visibleOrders[idx - 1]) !== hourKey(o)) && (
                  <p className="flex items-center gap-2 pt-1 text-[11px] font-black text-gray-400 uppercase">
                    <Clock size={11} /> {hourKey(o) === 'sin' ? 'Sin hora asignada' : `${hourKey(o)}:00`}
                    <span className="flex-1 h-px bg-gray-100" />
                  </p>
                )}
                <div className={`border-2 rounded-xl p-3 ${
                  o.status === 'charged' ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                          o.scheduled_time ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-400'}`}>
                          <Clock size={10} /> {hhmm(o.scheduled_time) ?? 'Sin hora'}
                        </span>
                        {o.number ?? 'Pedido'}
                        {o.status === 'charged' && (
                          <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">
                            ENTREGADO / COBRADO
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-bold text-gray-500 truncate">
                        {o.customer_name ?? 'Sin cliente'}
                        {o.customer_phone ? ` · ${o.customer_phone}` : ''}
                      </p>
                      {o.needs_reschedule && (
                        <p className="text-[11px] font-black text-red-700 flex items-start gap-1">
                          <Ban size={11} className="shrink-0 mt-0.5" />
                          <span className="min-w-0">Sin reprogramar: {o.reject_reason ?? 'no se pudo entregar'}</span>
                        </p>
                      )}
                      {(o.customer_zone || o.delivery_place) && (
                        <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 truncate">
                          <MapPin size={11} className="shrink-0" />
                          {[o.customer_zone, o.delivery_place].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {o.scheduled_note && (
                        <p className="text-[11px] font-semibold text-amber-700 truncate">↳ {o.scheduled_note}</p>
                      )}
                    </div>
                    <span className="text-sm font-black tabular-nums shrink-0">{money(o.total)}</span>
                  </div>

                  {/* Responsable — solo en gestión: en la vista de horas el
                      responsable sale de quien hace el ticket, no de acá. */}
                  {!onlyHours && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <User size={13} className={o.assigned_to ? 'text-sky-600' : 'text-red-400'} />
                    <select
                      value={o.assigned_to ?? ''} disabled={busyId === o.id}
                      onChange={e => void assign(o, e.target.value)}
                      className={`flex-1 min-w-0 px-2 py-2 sm:py-1.5 border rounded-lg text-xs font-bold ${
                        o.assigned_to ? 'border-sky-200 bg-sky-50 text-sky-800'
                                      : 'border-red-200 bg-red-50 text-red-700'}`}>
                      <option value="">Sin responsable</option>
                      {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      {/* El responsable guardado puede no estar en la lista (usuario
                          desactivado): se muestra igual para no perderlo al abrir. */}
                      {o.assigned_to && !people.some(p => p.id === o.assigned_to) && (
                        <option value={o.assigned_to}>{o.assigned_name ?? 'Responsable anterior'}</option>
                      )}
                    </select>
                  </div>
                  )}

                  {!onlyHours && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <MapPin size={13} className={o.customer_zone || o.delivery_place ? 'text-emerald-600' : 'text-gray-300'} />
                      <input
                        type="text" defaultValue={o.customer_zone ?? ''} placeholder="Zona"
                        onBlur={e => { if (e.target.value !== (o.customer_zone ?? '')) void savePlace(o, { customer_zone: e.target.value }); }}
                        className="w-20 sm:w-24 shrink-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700" />
                      <input
                        type="text" defaultValue={o.delivery_place ?? ''} placeholder="Lugar de entrega"
                        onBlur={e => { if (e.target.value !== (o.delivery_place ?? '')) void savePlace(o, { delivery_place: e.target.value }); }}
                        className="flex-1 min-w-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700" />
                    </div>
                  )}

                  {/* Hora y posponer */}
                  {!onlyHours && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Clock size={13} className="text-gray-400" />
                    <input type="time" value={hhmm(o.scheduled_time) ?? ''} disabled={busyId === o.id}
                      onChange={e => void setTime(o, e.target.value)}
                      className="px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700" />
                    {[15, 30, 60].map(m => (
                      <button key={m} onClick={() => void postpone(o, m)} disabled={busyId === o.id}
                        title={`Posponer ${m} minutos`}
                        className="px-2.5 py-2 sm:py-1.5 rounded-lg border border-gray-200 text-[11px] font-black text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                        +{m}m
                      </button>
                    ))}
                    <button onClick={() => setMoving(o)} disabled={busyId === o.id}
                      className="flex items-center gap-1 px-2.5 py-2 sm:py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-black text-amber-800 hover:bg-amber-100 disabled:opacity-40">
                      <ArrowRight size={12} /> Trasladar
                    </button>
                    {!!o.reschedule_log?.length && (
                      <button onClick={() => setLogOf(o)} title="Ver reprogramaciones"
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                        <History size={12} />
                      </button>
                    )}
                    {busyId === o.id && <Loader2 size={13} className="animate-spin text-gray-400" />}
                  </div>
                  )}

                  {/* En solo horas, el responsable se muestra si ya lo hay, pero
                      no se puede cambiar desde acá. */}
                  {onlyHours && o.assigned_name && (
                    <p className="mt-1.5 text-[11px] font-bold text-sky-700 flex items-center gap-1">
                      <User size={11} /> {o.assigned_name}
                    </p>
                  )}
                </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      {moving && <MoveDialog order={moving} onClose={() => setMoving(null)} onMove={move} />}

      {(newTask || editingTask) && (
        <TaskEditor
          task={editingTask}
          day={day}
          people={people.map(p => ({ id: p.id, name: p.name }))}
          onClose={() => { setNewTask(false); setEditingTask(null); }}
          onSaved={() => {
            setNewTask(false); setEditingTask(null);
            setMsg({ kind: 'ok', text: 'Tarea guardada' });
            refresh();
          }}
        />
      )}

      {movingTask && (
        <MoveDialog
          order={{
            id: movingTask.id, number: movingTask.title,
            scheduled_date: movingTask.scheduled_date,
            scheduled_time: movingTask.scheduled_time,
          } as unknown as AgentOrder}
          onClose={() => setMovingTask(null)}
          onMove={(_o, date, time, reason) => moveTask(movingTask, date, time, reason)}
        />
      )}
      {logOf && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setLogOf(null)}>
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-black text-gray-800 flex items-center gap-2">
                <History size={16} className="text-gray-400" /> Reprogramaciones
              </span>
              <button onClick={() => setLogOf(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto no-scrollbar">
              {[...(logOf.reschedule_log ?? [])].reverse().map((r, i) => (
                <li key={i} className="text-xs font-bold text-gray-600 border-b border-gray-50 pb-1.5">
                  {r.from ?? '—'} {hhmm(r.from_time) ?? ''} → <span className="text-amber-700">{r.to ?? '—'} {hhmm(r.to_time) ?? ''}</span>
                  <span className="block text-[11px] font-semibold text-gray-400">
                    {new Date(r.at).toLocaleString('es-CR')}{r.reason ? ` · ${r.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

/** Traslado a otro día, con motivo. El motivo queda en la bitácora del pedido. */
const MoveDialog: React.FC<{
  order: AgentOrder;
  onClose: () => void;
  onMove: (o: AgentOrder, date: string, time: string, reason: string) => Promise<void>;
}> = ({ order, onClose, onMove }) => {
  const [date, setDate] = useState(order.scheduled_date ?? crToday());
  const [time, setTime] = useState(hhmm(order.scheduled_time) ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-gray-800 flex items-center gap-2">
            <ArrowRight size={16} className="text-amber-600" /> Trasladar {order.number ?? 'pedido'}
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Mañana', d: shiftDay(crToday(), 1) },
            { label: 'Pasado', d: shiftDay(crToday(), 2) },
            { label: 'En 1 semana', d: shiftDay(crToday(), 7) },
          ].map(q => (
            <button key={q.label} onClick={() => setDate(q.d)}
              className={`px-3 py-2 sm:py-1.5 rounded-lg border text-xs font-black ${
                date === q.d ? 'border-amber-400 bg-amber-50 text-amber-800'
                             : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
        </div>

        <input type="text" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Motivo (el cliente no estaba, falta producto…)"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />

        <button disabled={busy || !date}
          onClick={async () => { setBusy(true); await onMove(order, date, time, reason); setBusy(false); }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Trasladar
        </button>
      </div>
    </div>
  );
};

export default DeliveryAgenda;
