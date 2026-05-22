'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, RotateCw, AlertCircle,
  Lock, Loader2, Users,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { usersService } from '@/services/users/usersService';
import { activityService } from '@/services/users/activityService';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import type { User } from '@/types/Types_Users';
import { UserFormModal } from '../components/UserFormModal';
import { PasswordResetModal } from '../components/PasswordResetModal';

interface PendingUser {
  localId: string;
  form: any;
  tenantId: string;
  createdAt: string;
}

const pendingKey = (tid: string) => `users_pending_${tid}`;

function getPendingUsers(tid: string): PendingUser[] {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(tid)) ?? '[]');
  } catch {
    return [];
  }
}

function removePendingUser(tid: string, localId: string) {
  const list = getPendingUsers(tid).filter(p => p.localId !== localId);
  localStorage.setItem(pendingKey(tid), JSON.stringify(list));
}

type TabId = 'users';

export const UsersList: React.FC = () => {
  const { tenantId } = useTenantId();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

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

      // Sync pending users first
      const pending = getPendingUsers(tenantId);
      for (const p of pending) {
        try {
          await usersService.createUser(tenantId, p.form);
          removePendingUser(tenantId, p.localId);
        } catch {
          /* leave in queue if sync fails */
        }
      }

      const data = await usersService.getAllUsers(tenantId);
      setUsers(data);
      cacheSet(cacheKey_, data);
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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = () => {
    setEditingUser(null);
    setShowFormModal(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setShowFormModal(true);
  };

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
    // Log the action
    if (currentUser && tenantId) {
      const user = users.find(u => u.id === passwordUserId);
      if (user) {
        await activityService.logActivity(tenantId, {
          action: 'user_password_reset',
          entity_type: 'user',
          entity_id: passwordUserId,
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

    setDeletingId(userId);
    try {
      await usersService.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      cacheSet(cacheKey_, users.filter(u => u.id !== userId));

      // Log the action
      if (currentUser) {
        await activityService.logUserDeleted(
          tenantId,
          userId,
          user.full_name,
          currentUser.full_name
        ).catch(() => {});
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar usuario'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.full_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (u.email?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (u.phone?.toLowerCase() ?? '').includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Usuarios</h2>
          <span className="text-sm text-gray-500">({filteredUsers.length})</span>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Crear Usuario
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar por nombre, email o teléfono..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />

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
      {!loading && filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay usuarios</p>
          <p className="text-gray-400 text-sm mt-1">
            {search ? 'No coinciden los criterios de búsqueda' : 'Crea tu primer usuario para empezar'}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && filteredUsers.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Rol
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Teléfono
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {user.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {user.phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Restablecer contraseña"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={deletingId === user.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deletingId === user.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showFormModal && (
        <UserFormModal
          user={editingUser}
          onClose={() => {
            setShowFormModal(false);
            setEditingUser(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {showPasswordModal && passwordUserId && (
        <PasswordResetModal
          userId={passwordUserId}
          onClose={() => {
            setShowPasswordModal(false);
            setPasswordUserId(null);
          }}
          onSuccess={handlePasswordSuccess}
        />
      )}
    </div>
  );
};

// Exported as named export from beginning of component declaration
