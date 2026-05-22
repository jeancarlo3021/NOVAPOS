'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users2, AlertCircle, Loader2, Plus, Trash2, Eye,
  Edit, MoreVertical,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { teamsService } from '@/services/users/teamsService';
import { usersService } from '@/services/users/usersService';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import type { Team, User, TeamMember } from '@/types/Types_Users';
import { TeamFormModal } from '../components/TeamFormModal';
import { ViewMembersModal } from '../components/ViewMembersModal';
import { AddMembersModal } from '../components/AddMembersModal';

export const TeamsView: React.FC = () => {
  const { tenantId } = useTenantId();

  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cacheKey_ = cacheKey(tenantId, 'teams_list');
  const usersCacheKey_ = cacheKey(tenantId, 'users_list');

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
      cacheSet(usersCacheKey_, data);
    } catch {
      const cached = cacheGet<User[]>(usersCacheKey_);
      if (cached) setUsers(cached);
    }
  }, [tenantId, usersCacheKey_]);

  const loadTeams = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<Team[]>(cacheKey_);
        setTeams(cached ?? []);
        if (!cached) setError('Sin conexión — sin datos en caché');
        return;
      }

      const data = await teamsService.getAllTeams(tenantId);
      setTeams(data);
      cacheSet(cacheKey_, data);
    } catch (err: unknown) {
      const cached = cacheGet<Team[]>(cacheKey_);
      if (cached) {
        setTeams(cached);
      } else {
        setError(
          err instanceof Error ? err.message : 'Error al cargar equipos'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, cacheKey_]);

  useEffect(() => {
    loadUsers();
    loadTeams();
  }, [loadUsers, loadTeams]);

  const handleCreate = () => {
    setEditingTeam(null);
    setShowFormModal(true);
  };

  const handleEdit = (team: Team) => {
    setEditingTeam(team);
    setShowFormModal(true);
  };

  const handleFormSuccess = async () => {
    setShowFormModal(false);
    setEditingTeam(null);
    await loadTeams();
  };

  const handleViewMembers = (team: Team) => {
    setSelectedTeam(team);
    setShowMembersModal(true);
  };

  const handleAddMembers = (team: Team) => {
    setSelectedTeam(team);
    setShowAddMembersModal(true);
  };

  const handleMembersSuccess = async () => {
    setShowMembersModal(false);
    setShowAddMembersModal(false);
    setSelectedTeam(null);
    await loadTeams();
  };

  const handleDelete = async (teamId: string) => {
    if (!tenantId) return;

    setDeletingId(teamId);
    try {
      await teamsService.deleteTeam(teamId);
      setTeams(prev => prev.filter(t => t.id !== teamId));
      cacheSet(cacheKey_, teams.filter(t => t.id !== teamId));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar equipo'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Equipos</h2>
          <span className="text-sm text-gray-500">({teams.length})</span>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Crear Equipo
        </button>
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
      {!loading && teams.length === 0 && (
        <div className="text-center py-12">
          <Users2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin equipos aún</p>
          <p className="text-gray-400 text-sm mt-1">
            Crea tu primer equipo para organizar a tus usuarios
          </p>
        </div>
      )}

      {/* Team Cards Grid */}
      {!loading && teams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <div
              key={team.id}
              className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              {/* Team Color + Name */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-4 h-4 rounded flex-shrink-0 mt-1"
                  style={{ backgroundColor: team.color || '#3b82f6' }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {team.name}
                  </h3>
                  {team.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {team.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Member Count */}
              <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
                <Users2 className="w-4 h-4" />
                <span>
                  {team.members?.length ?? 0} miembro{(team.members?.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleViewMembers(team)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Ver miembros"
                >
                  <Eye className="w-4 h-4" />
                  Ver
                </button>
                <button
                  onClick={() => handleEdit(team)}
                  className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(team.id)}
                  disabled={deletingId === team.id}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Eliminar"
                >
                  {deletingId === team.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showFormModal && (
        <TeamFormModal
          team={editingTeam}
          onClose={() => {
            setShowFormModal(false);
            setEditingTeam(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {showMembersModal && selectedTeam && (
        <ViewMembersModal
          team={selectedTeam}
          allUsers={users}
          onClose={() => {
            setShowMembersModal(false);
            setSelectedTeam(null);
          }}
          onAddMembers={() => {
            setShowMembersModal(false);
            setShowAddMembersModal(true);
          }}
          onMembersChanged={handleMembersSuccess}
        />
      )}

      {showAddMembersModal && selectedTeam && (
        <AddMembersModal
          team={selectedTeam}
          allUsers={users}
          currentMembers={selectedTeam.members || []}
          onClose={() => {
            setShowAddMembersModal(false);
            setSelectedTeam(null);
          }}
          onSuccess={handleMembersSuccess}
        />
      )}
    </div>
  );
};
