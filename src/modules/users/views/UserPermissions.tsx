'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Lock, AlertCircle, Loader2, Users, Info,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { usersService } from '@/services/users/usersService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import type { User, UserModule, UserPermissionMatrix } from '@/types/Types_Users';
import { PermissionsMatrix } from '../components/PermissionsMatrix';

const MODULES: UserModule[] = [
  'pos',
  'inventory',
  'reports',
  'expenses',
  'purchases',
  'users',
  'promotions',
  'accounts_payable',
  'hr',
];

const MODULE_LABELS: Record<UserModule, string> = {
  pos: 'Punto de Venta',
  inventory: 'Inventario',
  reports: 'Reportes',
  expenses: 'Gastos',
  purchases: 'Compras',
  users: 'Usuarios',
  promotions: 'Promociones',
  accounts_payable: 'Cuentas por Pagar',
  hr: 'Recursos Humanos',
};

export const UserPermissions: React.FC = () => {
  const { tenantId } = useTenantId();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<UserPermissionMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

      const data = await usersService.getAllUsers(tenantId);
      setUsers(data);
    } catch (err: unknown) {
      const cached = cacheGet<User[]>(cacheKey_);
      if (cached) {
        setUsers(cached);
      } else {
        setError(
          err instanceof Error ? err.message : 'Error al cargar usuarios'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, cacheKey_]);

  const loadPermissions = useCallback(async (userId: string) => {
    if (!tenantId) return;
    setPermissionsLoading(true);
    setError('');
    try {
      if (!navigator.onLine) {
        setError('Sin conexión — no se pueden cargar los permisos');
        setPermissions(null);
        return;
      }

      const data = await usersService.getUserPermissions(userId);
      setPermissions(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar permisos'
      );
      setPermissions(null);
    } finally {
      setPermissionsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    loadPermissions(userId);
  };

  const handlePermissionsChange = async (newPermissions: UserPermissionMatrix) => {
    if (!selectedUserId || !tenantId) return;

    setSaving(true);
    setError('');
    try {
      if (!navigator.onLine) {
        setError('Sin conexión — no se pueden guardar los cambios');
        setSaving(false);
        return;
      }

      await usersService.updateUserPermissions(selectedUserId, newPermissions);
      setPermissions(newPermissions);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar permisos'
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Lock className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Permisos de Usuarios</h2>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg flex items-start gap-3">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">
          Haz clic en una celda para cambiar. 'Crear', 'Editar' y 'Eliminar' solo funcionan si 'Acceder' está habilitado.
        </p>
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

      {/* User Selection */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay usuarios</p>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecciona un usuario
            </label>
            <select
              value={selectedUserId || ''}
              onChange={(e) => handleUserSelect(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Selecciona un usuario --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {/* Permissions Matrix */}
          {selectedUser && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">
                Permisos para: <span className="text-blue-600">{selectedUser.full_name}</span>
              </h3>

              {permissionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : permissions ? (
                <PermissionsMatrix
                  permissions={permissions}
                  modules={MODULES}
                  moduleLabels={MODULE_LABELS}
                  onSave={handlePermissionsChange}
                  saving={saving}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No se pudieron cargar los permisos
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
