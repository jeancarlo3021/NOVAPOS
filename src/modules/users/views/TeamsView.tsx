'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users2, AlertCircle, Loader2, Plus, Trash2, Eye,
  Edit, UserPlus,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { teamsService } from '@/services/users/teamsService';
import { usersService } from '@/services/users/usersService';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import type { Team, User } from '@/types/Types_Users';
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

  // Personas distintas que pertenecen a al menos un equipo (sin contar duplicados
  // si alguien está en varios equipos).
  const memberUserIds = new Set<string>();
  teams.forEach(t => t.members?.forEach(m => { if (m.user_id) memberUserIds.add(m.user_id); }));
  const totalMembers = memberUserIds.size;
  const unassignedUsers = users.filter(u => !memberUserIds.has(u.id)).length;

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500">
            <Users2 size={20} className="text-white" />
          </div>
          <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Equipos</p>
            <p className="text-gray-900 font-black text-xl">{teams.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500">
            <Users2 size={20} className="text-white" />
          </div>
          <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Total miembros</p>
            <p className="text-gray-900 font-black text-xl">{totalMembers}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500">
            <AlertCircle size={20} className="text-white" />
          </div>
          <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Sin equipo</p>
            <p className="text-gray-900 font-black text-xl">{unassignedUsers}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-black text-gray-900">Equipos</h2>
          <span className="text-sm text-gray-400 font-bold">({teams.length})</span>
        </div>
        <button onClick={handleCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition">
          <Plus className="w-4 h-4" /> Crear equipo
        </button>
      </div>

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

      {!loading && teams.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-12">
          <Users2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">Sin equipos aún</p>
          <p className="text-gray-400 text-sm mt-1">Crea tu primer equipo para organizar a tus usuarios</p>
        </div>
      )}

      {!loading && teams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => {
            const memberCount = team.members?.length ?? 0;
            return (
              <div key={team.id}
                className="bg-white border-2 border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition group">
                {/* Header con color */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white font-black"
                    style={{ backgroundColor: team.color || '#3b82f6' }}
                  >
                    {team.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900 truncate">{team.name}</h3>
                    {team.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{team.description}</p>
                    )}
                  </div>
                </div>

                {/* Avatars de miembros (preview) */}
                <div className="flex items-center justify-between mb-4 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Users2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-700">
                      {memberCount} miembro{memberCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {memberCount > 0 && team.members && (
                    <div className="flex -space-x-1.5">
                      {team.members.slice(0, 4).map(m => {
                        const userName = m.users?.full_name ?? '?';
                        const init = userName.split(' ').slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
                        return (
                          <div key={m.id}
                            title={userName}
                            className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-gray-700">
                            {init}
                          </div>
                        );
                      })}
                      {memberCount > 4 && (
                        <div className="w-7 h-7 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-600">
                          +{memberCount - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex gap-2">
                  <button onClick={() => handleViewMembers(team)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                    <Eye className="w-3.5 h-3.5" /> Ver miembros
                  </button>
                  <button onClick={() => handleAddMembers(team)}
                    className="px-3 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                    title="Agregar miembros">
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleEdit(team)}
                    className="px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                    title="Editar">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(team.id)}
                    disabled={deletingId === team.id}
                    className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                    title="Eliminar">
                    {deletingId === team.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showFormModal && (
        <TeamFormModal
          isOpen={showFormModal}
          team={editingTeam ?? undefined}
          onClose={() => {
            setShowFormModal(false);
            setEditingTeam(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {showMembersModal && selectedTeam && (
        <ViewMembersModal
          isOpen={showMembersModal}
          team={selectedTeam}
          members={selectedTeam.members || []}
          onClose={() => {
            setShowMembersModal(false);
            setSelectedTeam(null);
          }}
          onMemberRemoved={handleMembersSuccess}
        />
      )}

      {showAddMembersModal && selectedTeam && (
        <AddMembersModal
          isOpen={showAddMembersModal}
          teamId={selectedTeam.id}
          teamName={selectedTeam.name}
          existingMembers={(selectedTeam.members || []).map(m => m.user_id)}
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
