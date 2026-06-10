import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Plus, RefreshCw, AlertCircle, CheckCircle2, X, Trash2,
  Crown, Layers, Wallet, BarChart3, FileText, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  tenantGroupsService,
  type TenantGroup, type BranchMember, type GroupBilling, type FePlan, type UserLite,
} from '@/services/admin/tenantGroupsService';

const fmt = (n: number) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR')}`;
const fmtDate = (s?: string | null) =>
  s ? new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString('es-CR') : '—';

interface GroupDetail {
  group: TenantGroup;
  owner_info: { id: string; email: string | null; full_name: string | null } | null;
  members: BranchMember[];
  billing: GroupBilling | null;
}

export function TenantGroupView() {
  const [groups,   setGroups]   = useState<TenantGroup[]>([]);
  /** Mapa groupId → detalle cargado. Cada grupo se carga independientemente. */
  const [details,  setDetails]  = useState<Record<string, GroupDetail>>({});
  /** Set de groupIds expandidos. Por defecto el 1ro queda expandido. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  /** Grupo activo para modales contextuales (transfer, add-branch, etc.). */
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const [feCatalog, setFeCatalog] = useState<FePlan[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [showCreateGroup,  setShowCreateGroup]  = useState(false);
  const [showAddBranch,    setShowAddBranch]    = useState(false);
  const [showTransfer,     setShowTransfer]     = useState(false);
  const [users,            setUsers]            = useState<UserLite[]>([]);

  const flash = (ok: boolean, msg: string) => {
    setError(ok ? '' : msg);
    setSuccess(ok ? msg : '');
    setTimeout(() => { setError(''); setSuccess(''); }, 4500);
  };

  // ── Cargar lista de grupos + auto-expandir primero ──────────────────────
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [list, fe, ul] = await Promise.all([
        // 'all' porque esta vista vive en el Panel Admin (super-admin only).
        // Si el user NO es super-admin, el backend cae a su propio scope.
        tenantGroupsService.list('all'),
        tenantGroupsService.feCatalog().catch(() => []),
        tenantGroupsService.usersLite().catch(() => [] as UserLite[]),
      ]);
      setGroups(list);
      setFeCatalog(fe);
      setUsers(ul);
      // Auto-expandir el primero al cargar inicial.
      if (list.length > 0) {
        setExpandedIds(prev => {
          if (prev.size > 0) return prev;
          return new Set([list[0].id]);
        });
      }
    } catch (e: any) {
      flash(false, `Error cargando grupos: ${e?.message ?? e}`);
    } finally { setLoading(false); }
  }, []);

  // ── Cargar detalle de UN grupo ──────────────────────────────────────────
  const loadDetail = useCallback(async (groupId: string) => {
    try {
      const [d, b] = await Promise.all([
        tenantGroupsService.get(groupId),
        tenantGroupsService.billing(groupId).catch(() => null),
      ]);
      setDetails(prev => ({
        ...prev,
        [groupId]: { group: d.group, owner_info: d.owner_info, members: d.members, billing: b },
      }));
    } catch (e: any) {
      flash(false, `Error cargando detalle: ${e?.message ?? e}`);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Cargar detalle cuando se expande un grupo (lazy load).
  useEffect(() => {
    for (const id of expandedIds) {
      if (!details[id]) loadDetail(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds]);

  const toggleExpand = (groupId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const reloadAll = async () => {
    await loadGroups();
    // Recargar detalles de los grupos expandidos.
    for (const id of expandedIds) await loadDetail(id);
  };

  // ── Acciones (por grupo) ────────────────────────────────────────────────
  const handleUnlinkBranch = async (groupId: string, tenantId: string, tenantName: string) => {
    if (!confirm(`¿Desvincular "${tenantName}" del grupo? (El tenant no se elimina, solo se desvincula)`)) return;
    setBusy(true);
    try {
      await tenantGroupsService.unlinkBranch(groupId, tenantId);
      flash(true, `"${tenantName}" desvinculada`);
      await loadDetail(groupId);
    } catch (e: any) { flash(false, e?.message ?? 'Error'); }
    finally { setBusy(false); }
  };

  const handleChangeFePlan = async (groupId: string, tenantId: string, fePlanId: string) => {
    setBusy(true);
    try {
      await tenantGroupsService.setBranchFePlan(groupId, tenantId, fePlanId);
      flash(true, 'Plan FE actualizado');
      await loadDetail(groupId);
    } catch (e: any) { flash(false, e?.message ?? 'Error'); }
    finally { setBusy(false); }
  };

  const handleDeleteGroup = async (group: TenantGroup) => {
    if (!confirm(`¿Eliminar el grupo "${group.name}"? Los tenants no se eliminan, solo se desvinculan.`)) return;
    setBusy(true);
    try {
      await tenantGroupsService.remove(group.id);
      setDetails(prev => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.delete(group.id);
        return next;
      });
      flash(true, `Grupo "${group.name}" eliminado`);
      await loadGroups();
    } catch (e: any) { flash(false, e?.message ?? 'Error'); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <RefreshCw size={18} className="animate-spin" /> Cargando grupos…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center">
          <Layers size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black text-gray-900">Grupos de empresas (multi-sucursal)</h2>
          <p className="text-xs text-gray-500">
            Un grupo agrupa varios negocios bajo un usuario maestro. Cada sucursal tiene su propio plan FE.
          </p>
        </div>
        <button onClick={() => setShowCreateGroup(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition">
          <Plus size={14} /> Nuevo grupo
        </button>
        <button onClick={reloadAll}
          className="p-2 border border-gray-200 rounded-xl hover:border-gray-300 text-gray-500 transition">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">
          <CheckCircle2 size={16} /><span>{success}</span>
        </div>
      )}

      {/* Sin grupos */}
      {groups.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <Building2 size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-bold">Aún no tenés grupos creados</p>
          <p className="text-gray-400 text-sm mt-1">Creá uno para gestionar empresas con múltiples sucursales.</p>
        </div>
      )}

      {/* Lista de TODOS los grupos como cards expandibles */}
      {groups.length > 0 && (
        <div className="space-y-3">
          {groups.map(g => {
            const d = details[g.id];
            const expanded = expandedIds.has(g.id);
            return (
              <div key={g.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header del card (siempre visible, clickable para expandir) */}
                <button
                  onClick={() => toggleExpand(g.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition"
                >
                  <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center shrink-0">
                    <Layers size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900 truncate">{g.name}</h3>
                    <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                      {g.billing_email && <span>{g.billing_email}</span>}
                      <span>·</span>
                      <span>Creado {fmtDate(g.created_at)}</span>
                      {d?.billing && (
                        <>
                          <span>·</span>
                          <span className="font-black text-emerald-600 tabular-nums">
                            {fmt(d.billing.grand_total)}/mes
                          </span>
                          <span className="text-gray-400">({d.billing.branches} suc)</span>
                        </>
                      )}
                    </p>
                  </div>
                  {expanded ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
                </button>

                {/* Contenido expandible */}
                {expanded && (
                  <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/30">
                    {!d ? (
                      <div className="flex items-center justify-center py-6 text-gray-400 gap-2 text-sm">
                        <RefreshCw size={14} className="animate-spin" /> Cargando detalle…
                      </div>
                    ) : (
                      <>
                        {/* KPIs de billing */}
                        {d.billing && (
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[
                              { icon: Building2, label: 'Sucursales',     value: String(d.billing.branches),     color: 'bg-blue-500' },
                              { icon: Wallet,    label: 'SaaS (mes)',     value: fmt(d.billing.saas_total),      color: 'bg-emerald-500' },
                              { icon: Zap,       label: 'FE (mes)',       value: fmt(d.billing.fe_total),        color: 'bg-violet-500' },
                              { icon: BarChart3, label: 'TOTAL MENSUAL',  value: fmt(d.billing.grand_total),     color: 'bg-amber-500' },
                            ].map(({ icon: Icon, label, value, color }) => (
                              <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                                  <Icon size={14} className="text-white" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{label}</p>
                                  <p className="text-sm font-black text-gray-900 tabular-nums truncate">{value}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Owner del grupo */}
                        <div className="bg-linear-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                            <Crown size={16} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Usuario principal</p>
                            <p className="text-sm font-black text-amber-900 truncate">
                              {d.owner_info?.full_name || d.owner_info?.email || 'Sin datos'}
                            </p>
                          </div>
                          <button
                            onClick={() => { setActiveGroupId(g.id); setShowTransfer(true); }}
                            className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-700 text-xs font-bold transition"
                          >
                            Cambiar
                          </button>
                        </div>

                        {/* Tabla de sucursales con plan FE editable */}
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                            <p className="font-black text-gray-800 text-sm">
                              {d.members.length} sucursal{d.members.length === 1 ? '' : 'es'}
                            </p>
                            <button onClick={() => { setActiveGroupId(g.id); setShowAddBranch(true); }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition">
                              <Plus size={11} /> Agregar sucursal
                            </button>
                          </div>
                          {d.members.length === 0 ? (
                            <div className="py-6 text-center text-xs text-gray-400">
                              Sin sucursales. Tocá "Agregar sucursal" para empezar.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase">
                                    <th className="text-left px-4 py-2">Negocio</th>
                                    <th className="text-left px-4 py-2">Rol</th>
                                    <th className="text-left px-4 py-2">Plan SaaS</th>
                                    <th className="text-left px-4 py-2">Plan FE</th>
                                    <th className="text-center px-4 py-2">Estado</th>
                                    <th className="text-center px-4 py-2"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {d.members.map(m => {
                                    if (!m.tenant) return null;
                                    const t = m.tenant;
                                    const fePlanId = m.fe?.fe_plan_id ?? '';
                                    return (
                                      <tr key={t.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-2">
                                          <p className="font-bold text-gray-900">{t.name}</p>
                                          <p className="text-[9px] text-gray-400 font-mono">{t.id.slice(0, 8)}</p>
                                        </td>
                                        <td className="px-4 py-2">
                                          {m.role === 'main' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">
                                              <Crown size={8} /> Matriz
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
                                              Sucursal
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-600">
                                          {t.subscription?.plan?.name ?? 'Sin plan'}
                                          {t.subscription?.plan?.price != null && (
                                            <span className="block text-[9px] text-gray-400">{fmt(t.subscription.plan.price)}/mes</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2">
                                          <select value={fePlanId} disabled={busy}
                                            onChange={e => handleChangeFePlan(g.id, t.id, e.target.value)}
                                            className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white w-full max-w-48">
                                            <option value="">— Sin FE —</option>
                                            {feCatalog.map(fp => (
                                              <option key={fp.id} value={fp.id}>
                                                {fp.name} · {fmt(fp.monthly_price)}
                                              </option>
                                            ))}
                                          </select>
                                          {m.fe?.current_usage != null && (
                                            <p className="text-[9px] text-gray-400 mt-0.5">
                                              {m.fe.current_usage} / {m.fe.fe_plan?.monthly_quota ?? '—'} facts
                                            </p>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                            t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                          }`}>
                                            {t.status === 'active' ? '● Activa' : '● Suspendida'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          {m.role !== 'main' && (
                                            <button
                                              onClick={() => handleUnlinkBranch(g.id, t.id, t.name)}
                                              disabled={busy}
                                              title="Desvincular del grupo"
                                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition">
                                              <Trash2 size={11} />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Datos del grupo + Acciones */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Email de facturación</p>
                            <p className="text-gray-800 font-semibold mt-0.5">{d.group.billing_email ?? '—'}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Notas</p>
                            <p className="text-gray-800 mt-0.5">{d.group.notes ?? '—'}</p>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => handleDeleteGroup(g)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-bold rounded-lg transition"
                          >
                            <Trash2 size={11} /> Eliminar grupo
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: crear grupo */}
      {showCreateGroup && (
        <CreateGroupModal
          users={users}
          onClose={() => setShowCreateGroup(false)}
          onCreated={async () => {
            setShowCreateGroup(false);
            await loadGroups();
            flash(true, 'Grupo creado');
          }}
        />
      )}

      {/* Modal: transferir propiedad — usa activeGroupId */}
      {showTransfer && activeGroupId && details[activeGroupId] && (
        <TransferOwnerModal
          groupId={activeGroupId}
          currentOwnerId={details[activeGroupId].group.owner_id}
          users={users}
          onClose={() => { setShowTransfer(false); setActiveGroupId(null); }}
          onTransferred={async () => {
            const gid = activeGroupId;
            setShowTransfer(false);
            setActiveGroupId(null);
            if (gid) await loadDetail(gid);
            flash(true, 'Propiedad transferida');
          }}
        />
      )}

      {/* Modal: agregar sucursal — usa activeGroupId */}
      {showAddBranch && activeGroupId && (
        <AddBranchModal
          groupId={activeGroupId}
          feCatalog={feCatalog}
          onClose={() => { setShowAddBranch(false); setActiveGroupId(null); }}
          onAdded={async () => {
            const gid = activeGroupId;
            setShowAddBranch(false);
            setActiveGroupId(null);
            if (gid) await loadDetail(gid);
            flash(true, 'Sucursal agregada');
          }}
        />
      )}
    </div>
  );
}

// ── Modal: crear grupo ──────────────────────────────────────────────────────
function CreateGroupModal({
  users, onClose, onCreated,
}: {
  users: UserLite[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [ownerId, setOwnerId] = useState('');   // vacío = el creador queda como owner
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('El nombre es requerido'); return; }
    setSaving(true);
    try {
      await tenantGroupsService.create({
        name: name.trim(),
        billing_email: email.trim() || null,
        owner_id: ownerId || null,    // null = backend usa el JWT del creador
      });
      onCreated();
    } catch (e: any) { setErr(e?.message ?? 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900">Nuevo grupo</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{err}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nombre del grupo *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="Grupo Restaurantes Pérez"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1">
              <Crown size={11} className="text-amber-500" /> Usuario principal del grupo
            </label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">— Yo (el creador) —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name ? `${u.full_name} (${u.email})` : (u.email ?? u.id.slice(0, 8))}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Si dejás el default, vos quedás como dueño del grupo.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Email de facturación</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@grupo.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            <p className="text-[10px] text-gray-400 mt-1">A donde llegará la factura mensual del grupo.</p>
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
            {saving ? 'Creando…' : 'Crear grupo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: transferir propiedad ────────────────────────────────────────────
function TransferOwnerModal({
  groupId, currentOwnerId, users, onClose, onTransferred,
}: {
  groupId: string;
  currentOwnerId: string;
  users: UserLite[];
  onClose: () => void;
  onTransferred: () => void;
}) {
  const [newOwnerId, setNewOwnerId] = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');

  const candidates = users.filter(u => u.id !== currentOwnerId);

  const save = async () => {
    if (!newOwnerId) { setErr('Seleccioná un usuario destino'); return; }
    if (!confirm('¿Confirmás transferir la propiedad de este grupo?\n\nEl nuevo owner pasa a tener control TOTAL: puede modificar, agregar/quitar sucursales, e incluso transferirlo otra vez. Vos perdés el control directo del grupo.')) {
      return;
    }
    setSaving(true);
    try {
      await tenantGroupsService.transferOwner(groupId, newOwnerId);
      onTransferred();
    } catch (e: any) { setErr(e?.message ?? 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-linear-to-r from-amber-500 to-orange-500 text-white px-5 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Crown size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg leading-tight">Transferir propiedad</h3>
            <p className="text-xs text-amber-100">Cambiar el dueño principal del grupo</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <X size={14} className="text-white" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{err}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nuevo usuario principal *</label>
            <select value={newOwnerId} onChange={e => setNewOwnerId(e.target.value)} autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">— Seleccionar usuario —</option>
              {candidates.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name ? `${u.full_name} (${u.email})` : (u.email ?? u.id.slice(0, 8))}
                </option>
              ))}
            </select>
            {candidates.length === 0 && (
              <p className="text-[10px] text-amber-700 mt-1">No hay otros usuarios disponibles.</p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-bold mb-1">Qué pasa al transferir:</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              <li>El nuevo owner gana control TOTAL del grupo.</li>
              <li>Recibe acceso a TODAS las sucursales vía user_tenants.</li>
              <li>Vos perdés acceso directo (a menos que también estés en alguna sucursal).</li>
              <li>La facturación del grupo no cambia automáticamente — actualizá el billing_email si hace falta.</li>
            </ul>
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || !newOwnerId}
            className="flex-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
            {saving ? 'Transfiriendo…' : 'Transferir propiedad'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: agregar sucursal ────────────────────────────────────────────────
function AddBranchModal({
  groupId, feCatalog, onClose, onAdded,
}: {
  groupId: string;
  feCatalog: FePlan[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mode, setMode]         = useState<'new' | 'link'>('new');
  const [name, setName]         = useState('');
  const [linkId, setLinkId]     = useState('');
  const [planId, setPlanId]     = useState('');         // plan SaaS de módulos
  const [isDemo, setIsDemo]     = useState(false);
  const [fePlanId, setFePlan]   = useState('');         // plan Facturación Electrónica
  const [saasPlans, setSaasPlans] = useState<Array<{ id: string; name: string; price: number; billing_cycle?: string }>>([]);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  // Cargar catálogo de planes SaaS desde /plans
  useEffect(() => {
    (async () => {
      try {
        const { plansService } = await import('@/services/users/plansService');
        const list = await plansService.getAllPlans();
        const onlyActive = (Array.isArray(list) ? list : []).filter((p: any) => p?.is_active !== false);
        setSaasPlans(onlyActive.map((p: any) => ({
          id: p.id, name: p.name, price: p.price ?? 0, billing_cycle: p.billing_cycle,
        })));
      } catch { /* ignore — el dropdown quedará vacío */ }
    })();
  }, []);

  const save = async () => {
    setErr('');
    if (mode === 'new' && !name.trim())     { setErr('El nombre es requerido'); return; }
    if (mode === 'link' && !linkId.trim())  { setErr('El tenant_id es requerido'); return; }
    setSaving(true);
    try {
      await tenantGroupsService.addBranch(groupId, {
        ...(mode === 'new'
          ? { new_tenant: { name: name.trim(), plan_id: planId || null, is_demo: isDemo } }
          : { tenant_id: linkId.trim() }),
        fe_plan_id: fePlanId || null,
      });
      onAdded();
    } catch (e: any) { setErr(e?.message ?? 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900">Agregar sucursal</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setMode('new')}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-bold ${
                mode === 'new' ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-500'
              }`}>Crear nueva</button>
            <button onClick={() => setMode('link')}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-bold ${
                mode === 'link' ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-500'
              }`}>Enlazar existente</button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{err}</div>}

          {mode === 'new' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre de la sucursal *</label>
                <input value={name} onChange={e => setName(e.target.value)} autoFocus
                  placeholder="Sucursal Heredia Centro"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                <p className="text-[10px] text-gray-400 mt-1">Se crea un tenant nuevo en estado activo, con vos como dueño.</p>
              </div>

              {/* Plan SaaS de módulos */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Plan de módulos (SaaS)</label>
                <select value={planId} onChange={e => setPlanId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">— Sin plan asignado —</option>
                  {saasPlans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {fmt(p.price)}/{p.billing_cycle === 'yearly' ? 'año' : 'mes'}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Define qué módulos (POS, inventario, recetas, etc.) están habilitados en esta sucursal.
                </p>
              </div>

              {/* Demo */}
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                <input type="checkbox" checked={isDemo}
                  onChange={e => setIsDemo(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-500" />
                <span className="text-xs font-bold text-gray-700">Crear como DEMO</span>
                <span className="text-[10px] text-gray-400">(no se factura)</span>
              </label>
            </>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Tenant ID a enlazar *</label>
              <input value={linkId} onChange={e => setLinkId(e.target.value)} autoFocus
                placeholder="uuid del tenant existente"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              <p className="text-[10px] text-gray-400 mt-1">Pegá el UUID del tenant que querés vincular al grupo.</p>
            </div>
          )}

          {/* Plan FE (separado del plan SaaS) */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Plan FE (Facturación Electrónica)</label>
            <select value={fePlanId} onChange={e => setFePlan(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">— Sin plan FE —</option>
              {feCatalog.map(fp => (
                <option key={fp.id} value={fp.id}>
                  {fp.name} · {fmt(fp.monthly_price)}/mes · {fp.monthly_quota} facturas
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Cuota mensual de facturas con Hacienda. Se factura aparte del plan SaaS.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TenantGroupView;
