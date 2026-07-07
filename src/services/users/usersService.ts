import { apiFetch } from '@/lib/api';
import { validateUUID } from '@/lib/validation';
import type { User, CreateUserFormData, UpdateUserFormData } from '@/types/Types_Users';

// Dominio interno para respaldar usuarios sin correo en Supabase Auth.
export const USERNAME_DOMAIN = 'nexoerp.local';

// usuario → usuario@nexoerp.local (si ya es correo real, se deja igual)
export const usernameToEmail = (login: string): string => {
  const v = login.trim();
  return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`;
};

// usuario@nexoerp.local → usuario (para mostrar en la UI)
export const emailToUsername = (email?: string | null): string => {
  if (!email) return '';
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -(`@${USERNAME_DOMAIN}`).length) : email;
};

export const usersService = {
  async getAllUsers(_tenantId: string, scope: 'tenant' | 'group' = 'tenant'): Promise<User[]> {
    return apiFetch<User[]>(`/users?scope=${scope}`);
  },

  async createUser(_tenantId: string, form: CreateUserFormData & { target_tenant_id?: string | null }): Promise<User> {
    return apiFetch<User>('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: usernameToEmail(form.email),
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        phone: form.phone || null,
        target_tenant_id: form.target_tenant_id ?? null,
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

  /** Quick-switch del POS: valida un PIN contra los users del tenant y
   *  devuelve quién es. NO reemplaza la sesión — solo cambia el cashier
   *  activo del POS. */
  async pinLogin(pin: string): Promise<{ id: string; full_name: string; role: string; email: string; ticket_alias?: string }> {
    return apiFetch('/users/pin-login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  async setPin(userId: string, pin: string | null): Promise<void> {
    validateUUID(userId, 'userId');
    await apiFetch(`/users/${userId}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ pin }),
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
