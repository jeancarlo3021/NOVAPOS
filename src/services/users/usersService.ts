import { apiFetch } from '@/lib/api';
import { validateUUID } from '@/lib/validation';
import type { User, CreateUserFormData, UpdateUserFormData } from '@/types/Types_Users';

export const usersService = {
  async getAllUsers(_tenantId: string): Promise<User[]> {
    return apiFetch<User[]>('/users');
  },

  async createUser(_tenantId: string, form: CreateUserFormData): Promise<User> {
    return apiFetch<User>('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        phone: form.phone || null,
      }),
    });
  },

  async updateUser(userId: string, form: UpdateUserFormData): Promise<User> {
    validateUUID(userId, 'userId');
    return apiFetch<User>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
  },

  async deleteUser(userId: string): Promise<void> {
    validateUUID(userId, 'userId');
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
  },

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    validateUUID(userId, 'userId');
    await apiFetch(`/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password: newPassword }),
    });
  },

  async getAvailableRoles(): Promise<Array<{ value: string; label: string }>> {
    return apiFetch<Array<{ value: string; label: string }>>('/users/roles');
  },

  async getUserPermissions(userId: string): Promise<Record<string, any>> {
    validateUUID(userId, 'userId');
    return apiFetch<Record<string, any>>(`/users/${userId}/permissions`);
  },

  async updateUserPermissions(userId: string, permissions: Record<string, any>): Promise<void> {
    validateUUID(userId, 'userId');
    await apiFetch(`/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
  },
};
