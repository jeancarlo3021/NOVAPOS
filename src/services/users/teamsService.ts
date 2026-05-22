import { apiFetch } from '@/lib/api';
import { validateUUID } from '@/lib/validation';
import type { Team, CreateTeamFormData, UpdateTeamFormData } from '@/types/Types_Users';

export const teamsService = {
  async getAllTeams(_tenantId: string): Promise<Team[]> {
    return apiFetch<Team[]>('/teams');
  },

  async getTeamById(teamId: string): Promise<Team> {
    validateUUID(teamId, 'teamId');
    return apiFetch<Team>(`/teams/${teamId}`);
  },

  async createTeam(_tenantId: string, form: CreateTeamFormData): Promise<Team> {
    return apiFetch<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        color: form.color || '#3b82f6',
      }),
    });
  },

  async updateTeam(teamId: string, form: UpdateTeamFormData): Promise<Team> {
    validateUUID(teamId, 'teamId');
    return apiFetch<Team>(`/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
  },

  async deleteTeam(teamId: string): Promise<void> {
    validateUUID(teamId, 'teamId');
    await apiFetch(`/teams/${teamId}`, { method: 'DELETE' });
  },

  async addTeamMember(teamId: string, userId: string): Promise<void> {
    validateUUID(teamId, 'teamId');
    validateUUID(userId, 'userId');
    await apiFetch(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    validateUUID(teamId, 'teamId');
    validateUUID(userId, 'userId');
    await apiFetch(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
  },
};
