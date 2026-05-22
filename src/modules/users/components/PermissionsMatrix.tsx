'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Check, Lock } from 'lucide-react';
import { usersService } from '@/services/users/usersService';
import type { UserModule, UserPermissionMatrix } from '@/types/Types_Users';

interface PermissionsMatrixProps {
  userId: string;
  userName: string;
  modules: UserModule[];
  onSave?: () => void;
}

interface PermissionRow {
  module: UserModule;
  can_access: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const MODULE_LABELS: Record<UserModule, string> = {
  pos: 'POS',
  inventory: 'Inventario',
  reports: 'Reportes',
  expenses: 'Gastos',
  purchases: 'Compras',
  users: 'Usuarios',
  promotions: 'Promociones',
  accounts_payable: 'Cuentas por Pagar',
  hr: 'Recursos Humanos',
};

const PERMISSION_LABELS = {
  can_access: 'Acceder',
  can_create: 'Crear',
  can_edit: 'Editar',
  can_delete: 'Eliminar',
};

type PermissionKey = keyof Omit<PermissionRow, 'module'>;

export const PermissionsMatrix: React.FC<PermissionsMatrixProps> = ({
  userId,
  userName,
  modules,
  onSave,
}) => {
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadPermissions();
  }, [userId]);

  const loadPermissions = async () => {
    setLoading(true);
    setError('');
    try {
      const perms = await usersService.getUserPermissions(userId);
      const matrix: PermissionRow[] = modules.map((module) => ({
        module,
        can_access: perms[module]?.can_access ?? true,
        can_create: perms[module]?.can_create ?? false,
        can_edit: perms[module]?.can_edit ?? false,
        can_delete: perms[module]?.can_delete ?? false,
      }));
      setPermissions(matrix);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar permisos');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (module: UserModule, permission: PermissionKey) => {
    setPermissions((prev) =>
      prev.map((row) =>
        row.module === module
          ? { ...row, [permission]: !row[permission] }
          : row
      )
    );
    setSuccess('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const permissionMatrix: UserPermissionMatrix = {};
      permissions.forEach((row) => {
        permissionMatrix[row.module] = {
          can_access: row.can_access,
          can_create: row.can_create,
          can_edit: row.can_edit,
          can_delete: row.can_delete,
        };
      });

      await usersService.updateUserPermissions(userId, permissionMatrix);
      setSuccess('Permisos guardados correctamente');
      onSave?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar permisos');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500 text-sm">Cargando permisos...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Lock size={18} />
          Permisos de {userName}
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Configura el acceso y permisos por módulo
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
          <Check size={14} />
          {success}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Módulo
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Acceder
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Crear
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Editar
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Eliminar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {permissions.map((row) => (
              <tr key={row.module} className="hover:bg-gray-50 transition">
                <td className="px-6 py-3 font-medium text-gray-900">
                  {MODULE_LABELS[row.module]}
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={row.can_access}
                    onChange={() => togglePermission(row.module, 'can_access')}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    title={PERMISSION_LABELS.can_access}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={row.can_access && row.can_create}
                    onChange={() => togglePermission(row.module, 'can_create')}
                    disabled={!row.can_access}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={PERMISSION_LABELS.can_create}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={row.can_access && row.can_edit}
                    onChange={() => togglePermission(row.module, 'can_edit')}
                    disabled={!row.can_access}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={PERMISSION_LABELS.can_edit}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={row.can_access && row.can_delete}
                    onChange={() => togglePermission(row.module, 'can_delete')}
                    disabled={!row.can_access}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={PERMISSION_LABELS.can_delete}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-2">
        <button
          onClick={loadPermissions}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
        >
          Descartar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Check size={14} />
              Guardar Permisos
            </>
          )}
        </button>
      </div>

      <div className="px-6 py-3 bg-blue-50 border-t border-blue-200 text-xs text-blue-700">
        <p className="font-semibold mb-1">Nota sobre permisos:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Los permisos de crear, editar y eliminar requieren acceso al módulo</li>
          <li>Un usuario sin acceso a un módulo no podrá ver ninguna opción relacionada</li>
          <li>Los cambios se aplican inmediatamente después de guardar</li>
        </ul>
      </div>
    </div>
  );
};

export default PermissionsMatrix;
