'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, AlertCircle, Lock, Loader2,
  Users, Search, Crown, Filter, Mail, Phone, Calendar, Clock,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usersService, emailToUsername } from '@/services/users/usersService';
import { rolePermissionsService } from '@/services/users/rolePermissionsService';
import { activityService } from '@/services/users/activityService';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import type { User, UserRole } from '@/types/Types_Users';
import { ROLE_META } from '@/types/Types_Users';
import { UserFormModal } from '../components/UserFormModal';
import { PasswordResetModal } from '../components/PasswordResetModal';

export const UsersList: React.FC = () => {
  const { tenantId } = useTenantId();
  const { user: currentUser, tenant } = useAuth();
  // Límite de usuarios según el plan (null = ilimitado).
  const maxUsers = tenant?.subscription?.plan?.max_users ?? null;
  const { canDo } = useRolePermissions();
  const canCreate = canDo('users', 'create');
  const canEdit   = canDo('users', 'edit');
  const canDelete = canDo('users', 'delete');

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  // Scope: 'tenant' = solo el actual; 'group' = todas las sucursales accesibles.
  const [scope, setScope] = useState<'tenant' | 'group'>('tenant');
  // Filtro por sucursal cuando scope='group'.
  const [filterTenant, setFilterTenant] = useState<string>('all');
  // Modo de vista: 'flat' (lista plana) | 'grouped' (agrupada por sucursal).
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  // Mapa de tenant_id → nombre, para mostrar el nombre de la sucursal.
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  // Cache role → módulos accesibles, para chips por usuario.
  const [roleModules, setRoleModules] = useState<Record<string, string[]>>({});

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cacheKey_ = cacheKey(tenantId, 'users_list');

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<User[]>(cacheKey_);
        setUsers(cached ?? []);
        if (!cached) setError('Sin conexión — sin datos en caché');
        return;
      }
      const data = await usersService.getAllUsers(tenantId, scope);
      setUsers(data);
      cacheSet(cacheKey_, data);
    } catch (err: unknown) {
      const cached = cacheGet<User[]>(cacheKey_);
      if (cached) setUsers(cached);
      else setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [tenantId, cacheKey_, scope]);

  // Resolver nombres de sucursales — una vez por sesión de la lista.
  // Evitamos depender de `tenantNames` para que setTenantNames no re-dispare
  // el efecto (causaba loop infinito si algún user tenía tenant_id que
  // myTenants() no devolvía).
  const resolvedRef = React.useRef(false);
  useEffect(() => {
    if (resolvedRef.current) return;
    if (users.length === 0)   return;
    resolvedRef.current = true;
    (async () => {
      try {
        const { tenantGroupsService } = await import('@/services/admin/tenantGroupsService');
        const myTenants = await tenantGroupsService.myTenants().catch(() => []);
        if (Array.isArray(myTenants)) {
          const map: Record<string, string> = {};
          for (const t of myTenants) map[t.tenant_id] = t.tenant_name;
          setTenantNames(map);
        }
      } catch { /* ignore */ }
    })();
  }, [users.length]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Carga lazy de role_permissions para los roles únicos visibles en la lista.
  // Resultado: roleModules['cajero'] = ['pos', 'inventory', ...]
  useEffect(() => {
    const uniqueRoles = Array.from(new Set(users.map(u => u.role).filter(Boolean)));
    const pending = uniqueRoles.filter(r => !(r in roleModules) && r !== 'owner' && r !== 'admin');
    if (pending.length === 0) return;
    (async () => {
      const entries = await Promise.all(pending.map(async (r) => {
        try {
          const m = await rolePermissionsService.getRolePermissions(r);
          const mods = Object.keys(m).filter(k => m[k]?.can_access);
          return [r, mods] as const;
        } catch { return [r, []] as const; }
      }));
      setRoleModules(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [users, roleModules]);

  const handleCreate = () => {
    if (atUserLimit) {
      setError(`Tu plan permite hasta ${maxUsers} usuario${maxUsers === 1 ? '' : 's'}. Ya tenés ${currentTenantUserCount}. Mejorá tu plan para agregar más.`);
      return;
    }
    setEditingUser(null);
    setShowFormModal(true);
  };
  const handleEdit = (user: User) => { setEditingUser(user); setShowFormModal(true); };

  const handleFormSuccess = async () => {
    setShowFormModal(false);
    setEditingUser(null);
    await loadUsers();
  };

  const handleResetPassword = (userId: string) => {
    setPasswordUserId(userId);
    setShowPasswordModal(true);
  };

  const handlePasswordSuccess = async () => {
    setShowPasswordModal(false);
    setPasswordUserId(null);
    if (currentUser && tenantId) {
      const user = users.find(u => u.id === passwordUserId);
      if (user) {
        await activityService.logActivity(tenantId, {
          action: 'user_password_reset',
          entity_type: 'user',
          entity_id: passwordUserId ?? undefined,
          user_name: currentUser.full_name,
          details: { reset_user: user.full_name },
        }).catch(() => {});
      }
    }
  };

  const handleDelete = async (userId: string) => {
    if (!tenantId) return;
    const user = users.find(u => u.id === userId);
    if (!user) return;
    if (!confirm(`¿Eliminar al usuario "${user.full_name}"? Esta acción no se puede deshacer.`)) return;

    setDeletingId(userId);
    try {
      await usersService.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (currentUser) {
        await activityService.logUserDeleted(tenantId, userId, user.full_name, currentUser.full_name).catch(() => {});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar usuario');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Filtros y stats ──
  // Lista de tenants únicos presentes en los users cargados (para el filtro).
  const availableTenants = useMemo(() => {
    const ids = Array.from(new Set(users.map(u => (u as any).tenant_id).filter(Boolean)));
    return ids.map(id => ({ id, name: tenantNames[id] ?? id.slice(0, 8) }));
  }, [users, tenantNames]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !search ||
        (u.full_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
        (u.email?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
        (u.phone?.toLowerCase() ?? '').includes(search.toLowerCase());
      const matchRole   = filterRole   === 'all' || u.role === filterRole;
      const matchTenant = filterTenant === 'all' || (u as any).tenant_id === filterTenant;
      return matchSearch && matchRole && matchTenant;
    });
  }, [users, search, filterRole, filterTenant]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => { counts[u.role] = (counts[u.role] ?? 0) + 1; });
    return counts;
  }, [users]);

  const totalManagers = (roleCounts.owner ?? 0) + (roleCounts.admin ?? 0) + (roleCounts.gerente ?? 0);
  const totalOperators = users.length - totalManagers;

  // Usuarios de la sucursal actual (el límite del plan es por tenant).
  const currentTenantUserCount = useMemo(
    () => users.filter(u => !(u as any).tenant_id || (u as any).tenant_id === tenantId).length,
    [users, tenantId]
  );
  const atUserLimit = maxUsers != null && currentTenantUserCount >= maxUsers;

  const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();

  // ── Última conexión: formato relativo ("hace 5 min", "ayer", "hace 3 días")
  const formatLastSeen = (iso?: string | null): { label: string; color: string } => {
    if (!iso) return { label: 'Nunca', color: 'text-gray-300' };
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    if (diffMs < 0)            return { label: 'En el futuro',  color: 'text-gray-400' };
    const m = Math.floor(diffMs / 60000);
    if (m < 1)                 return { label: 'Ahora mismo',   color: 'text-emerald-600' };
    if (m < 60)                return { label: `Hace ${m} min`, color: 'text-emerald-600' };
    const h = Math.floor(m / 60);
    if (h < 24)                return { label: `Hace ${h} h`,   color: 'text-emerald-600' };
    const d = Math.floor(h / 24);
    if (d === 1)               return { label: 'Ayer',          color: 'text-gray-500' };
    if (d < 7)                 return { label: `Hace ${d} días`,color: 'text-gray-500' };
    if (d < 30)                return { label: `Hace ${Math.floor(d / 7)} sem`, color: 'text-amber-600' };
    if (d < 365)               return { label: `Hace ${Math.floor(d / 30)} meses`, color: 'text-amber-700' };
    return { label: 'Hace > 1 año', color: 'text-red-500' };
  };

  // ── Card de usuario (reutilizada por flat + grouped) ─────────────────────
  const renderUserCard = (
    user: User,
    meta: typeof ROLE_META[UserRole],
    isMe: boolean,
    isOwner: boolean,
  ) => (
    <div key={user.id}
      className={`bg-white p-5 rounded-2xl border-2 transition group ${
        isMe ? 'border-blue-300 bg-blue-50/30' : 'border-gray-100 hover:border-blue-200'
      }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-base shrink-0 bg-${meta.color}-100 text-${meta.color}-700`}>
          {initials(user.full_name ?? '?')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3 className="font-black text-gray-900 truncate">{user.full_name}</h3>
            {isMe && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">TÚ</span>
            )}
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-${meta.color}-100 text-${meta.color}-700`}>
            <span>{meta.emoji}</span> {meta.label}
          </span>
        </div>
      </div>

      <div className="space-y-1 text-xs text-gray-500 border-t border-gray-100 pt-3 mb-3">
        {user.email && (
          <div className="flex items-center gap-2 truncate">
            <Mail size={12} className="shrink-0" />
            <span className="truncate">{emailToUsername(user.email)}</span>
          </div>
        )}
        {user.phone && (
          <div className="flex items-center gap-2">
            <Phone size={12} className="shrink-0" /> {user.phone}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar size={12} className="shrink-0" />
          Creado: {new Date(user.created_at).toLocaleDateString('es-CR')}
        </div>
        {(() => {
          const ls = formatLastSeen(user.last_login_at);
          return (
            <div className={`flex items-center gap-2 font-semibold ${ls.color}`}>
              <Clock size={12} className="shrink-0" />
              Última conexión: <span>{ls.label}</span>
            </div>
          );
        })()}
      </div>

      {/* Chips: módulos a los que este usuario tiene acceso */}
      {(() => {
        const isAdminRole = user.role === 'owner' || user.role === 'admin';
        const modules = isAdminRole
          ? ['Acceso total']
          : (roleModules[user.role] ?? null);
        if (!modules) return (
          <div className="text-[10px] text-gray-300 italic mb-3">Cargando permisos…</div>
        );
        if (modules.length === 0) return (
          <div className="text-[10px] text-amber-600 mb-3 flex items-center gap-1">
            <AlertCircle size={11} /> Sin módulos asignados — configurá en Roles
          </div>
        );
        const MODULE_LABELS: Record<string, string> = {
          pos: 'POS', inventory: 'Inventario', reports: 'Reportes',
          expenses: 'Gastos', purchases: 'Compras',
          accounts_payable: 'Cuentas x Pagar', promotions: 'Promociones',
          users: 'Usuarios', hr: 'RRHH',
        };
        return (
          <div className="flex flex-wrap gap-1 mb-3">
            {modules.map(m => (
              <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {MODULE_LABELS[m] ?? m}
              </span>
            ))}
          </div>
        );
      })()}

      {!isOwner && (canEdit || canDelete) && (
        <div className="flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition">
          {canEdit && (
            <button onClick={() => handleEdit(user)}
              className="flex-1 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">
              <Pencil size={12} /> Editar
            </button>
          )}
          {canEdit && (
            <button onClick={() => handleResetPassword(user.id)}
              title="Restablecer contraseña"
              className="px-3 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg hover:bg-amber-100">
              <Lock size={12} />
            </button>
          )}
          {canDelete && !isMe && (
            <button onClick={() => handleDelete(user.id)}
              disabled={deletingId === user.id}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 disabled:opacity-50">
              {deletingId === user.id
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />}
            </button>
          )}
        </div>
      )}
      {!isOwner && !canEdit && !canDelete && (
        <div className="text-center text-xs text-gray-400 italic">
          Solo lectura
        </div>
      )}
      {isOwner && (
        <div className="text-center text-xs text-gray-400 italic">
          El propietario no se puede modificar
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total usuarios" value={String(users.length)} color="bg-blue-500" />
        <StatCard icon={Crown} label="Administradores" value={String(totalManagers)} color="bg-purple-500" sub="Owner + Admin + Gerente" />
        <StatCard icon={Users} label="Operativos" value={String(totalOperators)} color="bg-emerald-500" sub="Cajeros, meseros, cocina..." />
        <StatCard icon={Lock} label="Roles activos" value={String(Object.keys(roleCounts).length)} color="bg-amber-500" sub="tipos distintos" />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black text-gray-900">Usuarios</h2>
          <span className="text-sm text-gray-400 font-bold">({filteredUsers.length})</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 w-52"
            />
          </div>
          {canCreate && (
            <div className="flex items-center gap-2">
              {maxUsers != null && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${atUserLimit ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                  {currentTenantUserCount}/{maxUsers} usuarios
                </span>
              )}
              <button onClick={handleCreate} disabled={atUserLimit}
                title={atUserLimit ? `Tu plan permite hasta ${maxUsers} usuarios` : 'Crear usuario'}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-bold transition">
                <Plus size={16} /> Crear usuario
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filtros por rol ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        <button
          onClick={() => setFilterRole('all')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
            filterRole === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
          }`}
        >
          Todos ({users.length})
        </button>
        {(Object.keys(ROLE_META) as UserRole[])
          .filter(r => (roleCounts[r] ?? 0) > 0)
          .sort((a, b) => ROLE_META[b].level - ROLE_META[a].level)
          .map(r => {
            const meta = ROLE_META[r];
            const active = filterRole === r;
            return (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  active
                    ? `bg-${meta.color}-500 text-white`
                    : `bg-${meta.color}-50 text-${meta.color}-700 border border-${meta.color}-200 hover:bg-${meta.color}-100`
                }`}
              >
                {meta.emoji} {meta.label} ({roleCounts[r]})
              </button>
            );
          })}
      </div>

      {/* ── Toggles: scope + view mode + filtro sucursal ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Scope: tenant actual vs todas las sucursales del grupo */}
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setScope('tenant')}
            className={`px-3 py-1 rounded text-xs font-bold transition ${
              scope === 'tenant' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            Solo esta sucursal
          </button>
          <button
            onClick={() => setScope('group')}
            className={`px-3 py-1 rounded text-xs font-bold transition ${
              scope === 'group' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            Todas mis sucursales
          </button>
        </div>

        {/* View mode (solo si scope='group') */}
        {scope === 'group' && (
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                viewMode === 'flat' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              Lista plana
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                viewMode === 'grouped' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              Agrupar por sucursal
            </button>
          </div>
        )}

        {/* Filtro de tenant (solo si scope='group' y hay >1) */}
        {scope === 'group' && availableTenants.length > 1 && (
          <select
            value={filterTenant}
            onChange={e => setFilterTenant(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="all">Todas las sucursales</option>
            {availableTenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Errores ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && filteredUsers.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">No hay usuarios</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || filterRole !== 'all'
              ? 'Ningún usuario coincide con los filtros'
              : 'Crea tu primer usuario para empezar'}
          </p>
        </div>
      )}

      {/* ── Cards de usuarios — agrupado por sucursal ── */}
      {!loading && filteredUsers.length > 0 && viewMode === 'grouped' && scope === 'group' && (
        <div className="space-y-5">
          {availableTenants
            .filter(t => filteredUsers.some(u => (u as any).tenant_id === t.id))
            .map(t => {
              const usersOfTenant = filteredUsers.filter(u => (u as any).tenant_id === t.id);
              return (
                <div key={t.id} className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center font-black text-xs text-white">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="font-black text-gray-800 text-sm">{t.name}</h3>
                    <span className="text-xs text-gray-400 font-bold">({usersOfTenant.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {usersOfTenant.map(user => {
                      const meta = ROLE_META[user.role as UserRole] ?? ROLE_META.asistente_1;
                      const isMe = user.id === currentUser?.id;
                      const isOwner = user.role === 'owner';
                      return renderUserCard(user, meta, isMe, isOwner);
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ── Cards de usuarios — lista plana ── */}
      {!loading && filteredUsers.length > 0 && !(viewMode === 'grouped' && scope === 'group') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(user => {
            const meta = ROLE_META[user.role as UserRole] ?? ROLE_META.asistente_1;
            const isMe = user.id === currentUser?.id;
            const isOwner = user.role === 'owner';
            return renderUserCard(user, meta, isMe, isOwner);
          })}
        </div>
      )}

      {/* Modals */}
      {showFormModal && (
        <UserFormModal
          isOpen={showFormModal}
          user={editingUser ?? undefined}
          onClose={() => { setShowFormModal(false); setEditingUser(null); }}
          onSuccess={handleFormSuccess}
        />
      )}

      {showPasswordModal && passwordUserId && (
        <PasswordResetModal
          isOpen={showPasswordModal}
          userId={passwordUserId}
          userName={users.find(u => u.id === passwordUserId)?.full_name ?? ''}
          onClose={() => { setShowPasswordModal(false); setPasswordUserId(null); }}
          onSuccess={handlePasswordSuccess}
        />
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: any; label: string; value: string; color: string; sub?: string }> = ({ icon: Icon, label, value, color, sub }) => (
  <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center gap-3">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <Icon size={20} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
      {sub && <p className="text-gray-400 text-[10px]">{sub}</p>}
    </div>
  </div>
);
