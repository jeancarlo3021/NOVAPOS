import React, { useCallback, useEffect, useState } from 'react';
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
  const [withUser, setWithUser] = useState(true);
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

  const save = async () => {
    if (!editing?.name?.trim()) { setMsg({ kind: 'err', text: 'El agente necesita un nombre.' }); return; }
    const creating = !editing.id;
    if (creating && withUser) {
      if (!username.trim()) { setMsg({ kind: 'err', text: 'Poné el usuario con el que va a entrar.' }); return; }
      if (password.length < 6) { setMsg({ kind: 'err', text: 'La contraseña debe tener al menos 6 caracteres.' }); return; }
    }
    setSaving(true); setMsg(null);
    try {
      if (editing.id) {
        await salesAgentsService.update(editing.id, editing);
      } else {
        await salesAgentsService.create({
          ...editing,
          ...(withUser ? { create_user: true, username: username.trim(), password } : {}),
        });
      }
      setEditing(null); setUsername(''); setPassword(''); setWithUser(true);
      await load();
      setMsg({ kind: 'ok', text: creating && withUser
        ? 'Agente creado con su usuario. Ya puede entrar y armar pedidos.'
        : 'Agente guardado.' });
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
        <button onClick={() => { setUsername(''); setPassword(''); setWithUser(true); setEditing({ name: '', commission_percent: 0, is_active: true }); }}
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
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    <input type="checkbox" checked={withUser} onChange={e => setWithUser(e.target.checked)} />
                    Crearle también un usuario para entrar al sistema
                  </label>
                  <p className="text-[11px] text-gray-400 mt-1 ml-6">
                    Entra con rol <b>Agente de venta</b>: arma pedidos y los envía a caja.
                    No ve la caja ni el punto de venta. Aparece en <b>Usuarios</b>.
                  </p>
                  {withUser && (
                    <div className="grid grid-cols-2 gap-3 mt-3 ml-6">
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
