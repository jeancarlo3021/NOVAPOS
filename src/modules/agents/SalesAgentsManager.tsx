import React, { useCallback, useEffect, useState } from 'react';
import { usersService } from '@/services/users/usersService';
import { useTenantId } from '@/hooks/useTenant';
import type { User as AppUser } from '@/types/Types_Users';
import {
  UserCheck, Plus, Save, Trash2, Loader2, AlertCircle, CheckCircle2, TrendingUp, X,
} from 'lucide-react';
import { salesAgentsService, type SalesAgent } from '@/services/agents/salesAgentsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

/** Alta y edición de agentes de venta, con su reporte de ventas y comisiones. */
export const SalesAgentsManager: React.FC = () => {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<Partial<SalesAgent> | null>(null);
  // Acceso al sistema del agente (solo al CREAR: al editar ya existe o no).
  // Cómo entra el agente al sistema:
  //  'new'      → se le crea un usuario nuevo
  //  'existing' → se vincula uno que ya está creado (el caso normal cuando el
  //               vendedor ya trabajaba con otro rol)
  //  'none'     → no entra al sistema; alguien más arma sus pedidos
  const [accessMode, setAccessMode] = useState<'new' | 'existing' | 'none'>('new');
  const [linkUserId, setLinkUserId] = useState('');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [setAgentRole, setSetAgentRole] = useState(true);
  const { tenantId } = useTenantId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Reporte
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Awaited<ReturnType<typeof salesAgentsService.report>> | null>(null);
  const [loadingRep, setLoadingRep] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAgents(await salesAgentsService.list()); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo cargar' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadReport = useCallback(async () => {
    setLoadingRep(true);
    try { setReport(await salesAgentsService.report(from, to)); }
    catch { setReport(null); }
    finally { setLoadingRep(false); }
  }, [from, to]);
  useEffect(() => { void loadReport(); }, [loadReport]);

  useEffect(() => {
    if (!tenantId) return;
    usersService.getAllUsers(tenantId).then(setUsers).catch(() => setUsers([]));
  }, [tenantId]);

  /** Usuarios que ya están vinculados a un agente: no se pueden vincular dos veces. */
  const takenUserIds = new Set(agents.map(a => a.user_id).filter(Boolean) as string[]);

  const save = async () => {
    if (!editing?.name?.trim()) { setMsg({ kind: 'err', text: 'El agente necesita un nombre.' }); return; }
    const creating = !editing.id;
    if (creating && accessMode === 'new') {
      if (!username.trim()) { setMsg({ kind: 'err', text: 'Poné el usuario con el que va a entrar.' }); return; }
      if (password.length < 6) { setMsg({ kind: 'err', text: 'La contraseña debe tener al menos 6 caracteres.' }); return; }
    }
    if (creating && accessMode === 'existing' && !linkUserId) {
      setMsg({ kind: 'err', text: 'Elegí el usuario que va a ser este agente.' }); return;
    }
    setSaving(true); setMsg(null);
    try {
      if (editing.id) {
        await salesAgentsService.update(editing.id, editing);
      } else {
        await salesAgentsService.create({
          ...editing,
          ...(accessMode === 'new' ? { create_user: true, username: username.trim(), password } : {}),
          ...(accessMode === 'existing' ? { user_id: linkUserId } : {}),
        });
        // El rol manda lo que ve en el menú: sin cambiarlo, el usuario vinculado
        // sigue sin la pantalla de "Nuevo pedido".
        if (accessMode === 'existing' && setAgentRole) {
          const u = users.find(x => x.id === linkUserId);
          if (u && u.role !== 'agente') {
            await usersService.updateUser(linkUserId, {
              full_name: u.full_name, role: 'agente', phone: u.phone,
            } as any).catch(() => {});
          }
        }
      }
      setEditing(null); setUsername(''); setPassword('');
      setAccessMode('new'); setLinkUserId(''); setSetAgentRole(true);
      await load();
      setMsg({ kind: 'ok', text: !creating ? 'Agente guardado.'
        : accessMode === 'new' ? 'Agente creado con su usuario. Ya puede entrar y armar pedidos.'
        : accessMode === 'existing' ? 'Agente creado y vinculado al usuario existente.'
        : 'Agente creado. No tiene acceso al sistema.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally { setSaving(false); }
  };

  const deactivate = async (a: SalesAgent) => {
    if (!window.confirm(`¿Desactivar a ${a.name}?\n\nNo se borra: sus pedidos y comisiones quedan en el historial.`)) return;
    try { await salesAgentsService.deactivate(a.id); await load(); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo desactivar' }); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <UserCheck size={26} className="text-sky-600" /> Agentes de venta
          </h1>
          <p className="text-gray-600 text-sm">
            Quiénes venden fuera de caja. Cada uno arma pedidos que el cajero recibe y cobra.
          </p>
        </div>
        <button onClick={() => { setUsername(''); setPassword(''); setAccessMode('new'); setLinkUserId(''); setEditing({ name: '', commission_percent: 0, is_active: true }); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-black">
          <Plus size={15} /> Nuevo agente
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      {/* Agentes */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-black text-gray-700">
          {agents.length} agente(s)
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
        ) : agents.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">
            Sin agentes. Tocá <b>Nuevo agente</b> para crear el primero.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-2.5">Agente</th>
                  <th className="text-left px-4 py-2.5">Contacto</th>
                  <th className="text-center px-4 py-2.5">Comisión</th>
                  <th className="text-center px-4 py-2.5">Estado</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.map(a => (
                  <tr key={a.id} className={a.is_active ? '' : 'opacity-50'}>
                    <td className="px-5 py-3 font-bold text-gray-800">{a.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.phone || '—'}{a.email ? ` · ${a.email}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center font-black text-sky-700">{a.commission_percent}%</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                        a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(a)} className="text-xs font-bold text-sky-700 hover:underline mr-3">Editar</button>
                      {a.is_active && (
                        <button onClick={() => deactivate(a)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reporte de comisiones */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-black text-gray-700 flex items-center gap-1.5">
            <TrendingUp size={15} className="text-emerald-600" /> Ventas y comisiones
          </span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg" />
          <span className="text-xs text-gray-400">a</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg" />
          <span className="ml-auto text-xs text-gray-400">Solo pedidos ya COBRADOS</span>
        </div>
        {loadingRep ? (
          <div className="flex items-center justify-center py-8 text-gray-400 gap-2"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
        ) : !report || report.rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">Sin ventas cobradas en el rango.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-2.5">Agente</th>
                  <th className="text-center px-4 py-2.5">Pedidos</th>
                  <th className="text-right px-4 py-2.5">Vendido</th>
                  <th className="text-center px-4 py-2.5">%</th>
                  <th className="text-right px-5 py-2.5">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.rows.map(r => (
                  <tr key={r.agent_id ?? 'none'}>
                    <td className="px-5 py-3 font-bold text-gray-800">{r.agent_name}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.orders}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{money(r.total)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{r.commission_percent}%</td>
                    <td className="px-5 py-3 text-right tabular-nums font-black text-emerald-700">{money(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-5 py-2.5 font-black text-gray-700">Total</td>
                  <td className="px-4 py-2.5 text-center font-black tabular-nums">{report.totals.orders}</td>
                  <td className="px-4 py-2.5 text-right font-black tabular-nums">{money(report.totals.total)}</td>
                  <td />
                  <td className="px-5 py-2.5 text-right font-black tabular-nums text-emerald-700">{money(report.totals.commission)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Alta / edición */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900">{editing.id ? 'Editar agente' : 'Nuevo agente'}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Nombre</label>
                <input value={editing.name ?? ''} onChange={e => setEditing(v => ({ ...v!, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Teléfono</label>
                  <input value={editing.phone ?? ''} onChange={e => setEditing(v => ({ ...v!, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Comisión %</label>
                  <input type="number" min={0} max={100} step="any" value={editing.commission_percent ?? 0}
                    onChange={e => setEditing(v => ({ ...v!, commission_percent: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 text-sm text-right border border-gray-200 rounded-lg outline-none focus:border-sky-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Correo</label>
                <input value={editing.email ?? ''} onChange={e => setEditing(v => ({ ...v!, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-400" />
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
                <input type="checkbox" checked={editing.is_active ?? true}
                  onChange={e => setEditing(v => ({ ...v!, is_active: e.target.checked }))} />
                Activo
              </label>

              {/* Acceso al sistema. Solo al CREAR: si ya existe, el usuario se
                  administra desde el módulo Usuarios. */}
              {!editing.id && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[11px] font-black text-gray-500 uppercase mb-2">
                    Acceso al sistema
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: 'new', label: 'Usuario nuevo' },
                      { id: 'existing', label: 'Usuario existente' },
                      { id: 'none', label: 'Sin acceso' },
                    ] as Array<{ id: 'new' | 'existing' | 'none'; label: string }>).map(o => (
                      <button key={o.id} type="button" onClick={() => setAccessMode(o.id)}
                        className={`px-2 py-2 rounded-xl border-2 text-xs font-black transition ${
                          accessMode === o.id ? 'border-sky-500 bg-sky-50 text-sky-800'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {accessMode === 'existing' && (
                    <div className="mt-3 space-y-2">
                      <select value={linkUserId} onChange={e => {
                          setLinkUserId(e.target.value);
                          // El nombre del agente sale del usuario si aún está vacío:
                          // escribirlo dos veces es la forma de que no coincidan.
                          const u = users.find(x => x.id === e.target.value);
                          if (u) {
                            setEditing(v => ({
                              ...v!,
                              name: v?.name?.trim() ? v.name : (u.full_name || u.email),
                              email: v?.email || u.email,
                              phone: v?.phone || u.phone || null,
                            }));
                          }
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-400">
                        <option value="">Elegí el usuario…</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id} disabled={takenUserIds.has(u.id)}>
                            {u.full_name || u.email} · {u.role}
                            {takenUserIds.has(u.id) ? ' (ya es agente)' : ''}
                          </option>
                        ))}
                      </select>
                      {users.length === 0 && (
                        <p className="text-[11px] font-bold text-amber-700">
                          No se pudieron cargar los usuarios del negocio.
                        </p>
                      )}
                      <label className="flex items-start gap-2 text-[12px] font-bold text-gray-600">
                        <input type="checkbox" checked={setAgentRole}
                          onChange={e => setSetAgentRole(e.target.checked)} className="mt-0.5" />
                        <span>
                          Cambiarle el rol a <b>Agente de venta</b>
                          <span className="block text-[11px] font-semibold text-gray-400">
                            Sin esto conserva su rol actual y puede que no le aparezca "Nuevo pedido".
                          </span>
                        </span>
                      </label>
                    </div>
                  )}

                  {accessMode === 'none' && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      El agente queda registrado para comisiones, pero no entra al sistema:
                      sus pedidos los arma otra persona a su nombre.
                    </p>
                  )}

                  {accessMode === 'new' && (
                    <>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Entra con rol <b>Agente de venta</b>: arma pedidos y los envía a caja.
                      No ve la caja ni el punto de venta. Aparece en <b>Usuarios</b>.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Usuario</label>
                        <input value={username} onChange={e => setUsername(e.target.value)}
                          placeholder="ej. juan" autoComplete="off"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-400" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">Contraseña</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                          placeholder="mínimo 6" autoComplete="new-password"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-sky-400" />
                      </div>
                    </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4 flex gap-2">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-black hover:bg-gray-50">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesAgentsManager;
