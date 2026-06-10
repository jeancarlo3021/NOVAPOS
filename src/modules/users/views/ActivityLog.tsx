'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Clock, AlertCircle, Loader2, Filter, WifiOff,
  LogIn, UserPlus, UserMinus, Lock, FileText, ShoppingCart, TrendingDown,
  Package, Tag, Activity,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { activityService } from '@/services/users/activityService';
import { cacheGet, cacheSet, cacheKey } from '@/utils/offlineCache';
import type { ActivityLog as ActivityLogType, User } from '@/types/Types_Users';
import { usersService } from '@/services/users/usersService';
import { tenantGroupsService, type MyTenant } from '@/services/admin/tenantGroupsService';

interface ActionMeta {
  label: string;
  icon: React.ElementType;
  color: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  login:                { label: 'Inicio de sesión',         icon: LogIn,         color: 'blue'    },
  user_created:         { label: 'Usuario creado',           icon: UserPlus,      color: 'emerald' },
  user_deleted:         { label: 'Usuario eliminado',        icon: UserMinus,     color: 'red'     },
  user_password_reset:  { label: 'Contraseña restablecida',  icon: Lock,          color: 'amber'   },
  invoice_created:      { label: 'Factura creada',           icon: FileText,      color: 'emerald' },
  invoice_voided:       { label: 'Factura anulada',          icon: FileText,      color: 'red'     },
  purchase_created:     { label: 'Compra creada',            icon: ShoppingCart,  color: 'blue'    },
  expense_created:      { label: 'Gasto registrado',         icon: TrendingDown,  color: 'rose'    },
  product_created:      { label: 'Producto creado',          icon: Package,       color: 'emerald' },
  product_updated:      { label: 'Producto actualizado',     icon: Package,       color: 'sky'     },
  promotion_created:    { label: 'Promoción creada',         icon: Tag,           color: 'violet'  },
  promotion_updated:    { label: 'Promoción actualizada',    icon: Tag,           color: 'sky'     },
};

const META_DEFAULT: ActionMeta = { label: 'Acción', icon: Activity, color: 'gray' };
const fmtDateTime = (s: string) => new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });

export const ActivityLog: React.FC = () => {
  const { tenantId } = useTenantId();
  const [activities, setActivities] = useState<ActivityLogType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [actionSearch, setActionSearch] = useState('');
  // Scope: 'tenant' = sólo sucursal actual; 'group' = todas las del grupo.
  const [scope, setScope] = useState<'tenant' | 'group'>('tenant');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [myTenants, setMyTenants] = useState<MyTenant[]>([]);

  const cacheKey_ = cacheKey(tenantId, 'activity_logs');
  const usersCacheKey_ = cacheKey(tenantId, 'users_list');

  useEffect(() => {
    const up = () => setIsOnline(true);
    const dn = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', dn);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', dn);
    };
  }, []);

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    try {
      if (!navigator.onLine) {
        const c = cacheGet<User[]>(usersCacheKey_);
        if (c) setUsers(c);
        return;
      }
      setUsers(await usersService.getAllUsers(tenantId));
    } catch {
      const c = cacheGet<User[]>(usersCacheKey_);
      if (c) setUsers(c);
    }
  }, [tenantId, usersCacheKey_]);

  const loadLogs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setError('');
    try {
      if (!navigator.onLine) {
        setActivities(cacheGet<ActivityLogType[]>(cacheKey_) ?? []);
        return;
      }
      const filters: any = { limit: 500, scope };
      if (dateFrom) filters.from = dateFrom;
      if (dateTo) filters.to = dateTo;
      if (selectedUserId) filters.user_id = selectedUserId;
      if (actionSearch) filters.action = actionSearch;
      if (scope === 'group' && tenantFilter !== 'all') filters.tenant_id = tenantFilter;

      const data = await activityService.getActivityLogs(tenantId, filters);
      setActivities(data);
      if (!dateFrom && !dateTo && !selectedUserId && !actionSearch) cacheSet(cacheKey_, data);
    } catch (err: any) {
      const c = cacheGet<ActivityLogType[]>(cacheKey_);
      if (c) setActivities(c);
      else setError(err.message || 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }, [tenantId, dateFrom, dateTo, selectedUserId, actionSearch, scope, tenantFilter, cacheKey_]);

  // Cargar tenants accesibles para el filtro por sucursal
  useEffect(() => {
    tenantGroupsService.myTenants()
      .then(list => setMyTenants(Array.isArray(list) ? list : []))
      .catch(() => setMyTenants([]));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const sorted = useMemo(
    () => [...activities].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [activities],
  );

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = activities.filter(a => a.created_at.slice(0, 10) === today).length;
    const usersActive = new Set(activities.filter(a => a.user_id).map(a => a.user_id)).size;
    const logins = activities.filter(a => a.action === 'login').length;
    return { total: activities.length, todayCount, usersActive, logins };
  }, [activities]);

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setSelectedUserId(''); setActionSearch('');
  };
  const hasFilters = dateFrom || dateTo || selectedUserId || actionSearch;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-black text-gray-900">Historial de Actividad</h2>
      </div>

      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl flex items-start gap-3">
          <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold">Sin conexión — mostrando datos en caché</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Total registros" value={String(stats.total)} color="bg-blue-500" />
        <StatCard icon={Clock}    label="Hoy"             value={String(stats.todayCount)} color="bg-emerald-500" />
        <StatCard icon={LogIn}    label="Inicios sesión"  value={String(stats.logins)} color="bg-violet-500" />
        <StatCard icon={UserPlus} label="Usuarios activos" value={String(stats.usersActive)} color="bg-amber-500" />
      </div>

      {/* Scope toggle: general (grupo) vs por sucursal */}
      {myTenants.length > 1 && (
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Vista:</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => { setScope('tenant'); setTenantFilter('all'); }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                scope === 'tenant' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              Sucursal actual
            </button>
            <button onClick={() => setScope('group')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                scope === 'group' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              Todas las sucursales
            </button>
          </div>
          {scope === 'group' && (
            <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
              className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold bg-white">
              <option value="all">— Filtrar sucursal —</option>
              {myTenants.map(t => (
                <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider">Filtros</h3>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs font-bold text-blue-600 hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <FilterField label="Desde">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </FilterField>
          <FilterField label="Usuario">
            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
              <option value="">Todos</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Acción">
            <input type="text" placeholder="Ej: login, invoice..." value={actionSearch}
              onChange={e => setActionSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </FilterField>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-12">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">Sin actividad</p>
          <p className="text-gray-400 text-sm mt-1">
            {hasFilters ? 'No hay registros con esos filtros' : 'Aún no hay actividad'}
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && sorted.length > 0 && (
        <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-black text-gray-900 text-sm">
              Eventos recientes <span className="text-gray-400 font-normal">({sorted.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-150 overflow-y-auto">
            {sorted.map(a => {
              const meta = ACTION_META[a.action] ?? META_DEFAULT;
              const Icon = meta.icon;
              return (
                <div key={a.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-${meta.color}-100 text-${meta.color}-600`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-black px-2 py-0.5 rounded-md bg-${meta.color}-50 text-${meta.color}-700`}>
                        {meta.label}
                      </span>
                      {scope === 'group' && (a as any).tenant_id && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-100">
                          {myTenants.find(t => t.tenant_id === (a as any).tenant_id)?.tenant_name ?? '—'}
                        </span>
                      )}
                      {a.entity_type && (
                        <span className="text-[10px] text-gray-400 font-mono uppercase">
                          {a.entity_type}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{a.user_name ?? 'Sistema'}</p>
                    {a.details && Object.keys(a.details).length > 0 && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {Object.entries(a.details).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-mono shrink-0">{fmtDateTime(a.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: any; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      <Icon size={18} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide">{label}</p>
      <p className="text-gray-900 font-black text-xl leading-tight">{value}</p>
    </div>
  </div>
);

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">{label}</label>
    {children}
  </div>
);
