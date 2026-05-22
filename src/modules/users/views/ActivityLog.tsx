'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock, AlertCircle, Loader2, Users, Search, Filter,
  Wifi, WifiOff,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { activityService } from '@/services/users/activityService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import type { ActivityLog, User } from '@/types/Types_Users';
import { usersService } from '@/services/users/usersService';

export const ActivityLog: React.FC = () => {
  const { tenantId } = useTenantId();

  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [actionSearch, setActionSearch] = useState('');

  const cacheKey_ = cacheKey(tenantId, 'activity_logs');
  const usersCacheKey_ = cacheKey(tenantId, 'users_list');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<User[]>(usersCacheKey_);
        if (cached) setUsers(cached);
        return;
      }

      const data = await usersService.getAllUsers(tenantId);
      setUsers(data);
    } catch {
      const cached = cacheGet<User[]>(usersCacheKey_);
      if (cached) setUsers(cached);
    }
  }, [tenantId, usersCacheKey_]);

  const loadActivityLogs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<ActivityLog[]>(cacheKey_);
        setActivities(cached ?? []);
        if (!cached) setError('Sin conexión — sin datos en caché');
        return;
      }

      const filters: any = { limit: 500 };
      if (dateFrom) filters.from = dateFrom;
      if (dateTo) filters.to = dateTo;
      if (selectedUserId) filters.user_id = selectedUserId;
      if (actionSearch) filters.action = actionSearch;

      const data = await activityService.getActivityLogs(tenantId, filters);
      setActivities(data);

      // Cache only if no filters
      if (!dateFrom && !dateTo && !selectedUserId && !actionSearch) {
        cacheSet(cacheKey_, data);
      }
    } catch (err: unknown) {
      const cached = cacheGet<ActivityLog[]>(cacheKey_);
      if (cached) {
        setActivities(cached);
      } else {
        setError(
          err instanceof Error ? err.message : 'Error al cargar historial'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, dateFrom, dateTo, selectedUserId, actionSearch, cacheKey_]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadActivityLogs();
  }, [loadActivityLogs]);

  const displayedActivities = activities.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      login: 'Inicio de sesión',
      user_created: 'Usuario creado',
      user_deleted: 'Usuario eliminado',
      user_password_reset: 'Contraseña restablecida',
      invoice_created: 'Factura creada',
      purchase_created: 'Compra creada',
      expense_created: 'Gasto creado',
      product_created: 'Producto creado',
      product_updated: 'Producto actualizado',
      promotion_created: 'Promoción creada',
      promotion_updated: 'Promoción actualizada',
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Historial de Actividad</h2>
      </div>

      {/* Online Status Alert */}
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg flex items-start gap-3">
          <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Sin conexión a internet</p>
            <p className="text-sm">Se requiere conexión para ver el historial de actividad. Mostrando datos en caché.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Usuario
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todos</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Búsqueda de acción
            </label>
            <input
              type="text"
              placeholder="Ej: login, invoice..."
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {/* Empty State */}
      {!loading && displayedActivities.length === 0 && (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin actividad registrada</p>
          <p className="text-gray-400 text-sm mt-1">
            {dateFrom || dateTo || selectedUserId || actionSearch
              ? 'No hay registros que coincidan con los filtros'
              : 'Aún no hay actividad en el sistema'}
          </p>
        </div>
      )}

      {/* Activity List */}
      {!loading && displayedActivities.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Fecha y Hora
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Acción
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Tipo de Entidad
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  ID de Entidad
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Detalles
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayedActivities.map(activity => (
                <tr key={activity.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDateTime(activity.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {activity.user_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {getActionLabel(activity.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {activity.entity_type || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">
                    {activity.entity_id || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {activity.details ? (
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {JSON.stringify(activity.details).substring(0, 50)}...
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Entry Count */}
      {!loading && displayedActivities.length > 0 && (
        <div className="text-xs text-gray-500 text-right">
          Mostrando {displayedActivities.length} de {displayedActivities.length} registros
        </div>
      )}
    </div>
  );
};

// Import missing utility
import { cacheSet } from '@/utils/offlineCache';
