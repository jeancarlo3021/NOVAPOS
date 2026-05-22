import React, { useState } from 'react';
import { X, Loader2, Trash2, AlertCircle } from 'lucide-react';
import type { Team, TeamMember } from '@/types/Types_Users';
import { teamsService } from '@/services/users/teamsService';

interface ViewMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemberRemoved: () => void;
  team: Team;
  members: TeamMember[];
}

export const ViewMembersModal: React.FC<ViewMembersModalProps> = ({
  isOpen,
  onClose,
  onMemberRemoved,
  team,
  members,
}) => {
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`¿Eliminar a ${userName} del equipo "${team.name}"?`)) return;

    setRemoving(userId);
    setError('');
    try {
      await teamsService.removeTeamMember(team.id, userId);
      onMemberRemoved();
    } catch (err) {
      setError((err as any)?.message || 'Error al eliminar miembro');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Miembros de {team.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Members List */}
        <div className="max-h-96 overflow-y-auto">
          {members.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500">Sin miembros en este equipo</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {member.users?.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {member.users?.email || ''}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleRemoveMember(member.user_id, member.users?.full_name || 'Usuario')
                    }
                    disabled={removing === member.user_id}
                    className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50"
                    title="Eliminar del equipo"
                  >
                    {removing === member.user_id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
