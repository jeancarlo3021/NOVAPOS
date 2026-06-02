'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check, Search } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { usersService } from '@/services/users/usersService';
import { teamsService } from '@/services/users/teamsService';
import type { User } from '@/types/Types_Users';

interface AddMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  teamId: string;
  teamName: string;
  existingMembers: string[]; // user IDs already in team
}

export const AddMembersModal: React.FC<AddMembersModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  teamId,
  teamName,
  existingMembers,
}) => {
  const { tenantId } = useTenantId();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const loadUsers = async () => {
      if (!tenantId) return;
      setLoading(true);
      setError('');
      try {
        const data = await usersService.getAllUsers(tenantId);
        setUsers(data);
        setSelectedUsers(new Set());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const availableUsers = users.filter(
    (u) => !existingMembers.includes(u.id)
  );

  const filteredUsers = availableUsers.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleAddMembers = async () => {
    if (selectedUsers.size === 0) {
      setError('Selecciona al menos un usuario');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const memberIds = Array.from(selectedUsers);
      for (const userId of memberIds) {
        await teamsService.addTeamMember(teamId, userId);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al agregar miembros');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Agregar Miembros a {teamName}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 flex flex-col">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" />
              Cargando usuarios...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-gray-400 text-sm font-medium">
                {availableUsers.length === 0
                  ? 'Todos los usuarios ya están en este equipo'
                  : 'No hay resultados'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto">
              {filteredUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(user.id)}
                    onChange={() => toggleUser(user.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {user.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {selectedUsers.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
              {selectedUsers.size} usuario{selectedUsers.size !== 1 ? 's' : ''} seleccionado
              {selectedUsers.size !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleAddMembers}
            disabled={saving || selectedUsers.size === 0}
            className="flex-1 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Agregando...
              </>
            ) : (
              <>
                <Check size={14} />
                Agregar Seleccionados
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddMembersModal;
