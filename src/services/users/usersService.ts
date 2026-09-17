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

export interface TiendaDeUsuario {
  tenant_id: string;
  name: string;
  acceso: boolean;
  /** Tienda en la que está trabajando ahora. */
  actual: boolean;
}

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

  /** Tiendas que maneja quien edita, marcando a cuáles puede entrar el usuario. */
  async getUserTenants(userId: string): Promise<{ tiendas: TiendaDeUsuario[]; otras: number }> {
    validateUUID(userId, 'userId');
    return apiFetch(`/users/${userId}/tenants`);
  },

  /** Deja al usuario con acceso exactamente a estas tiendas (de las que maneja quien edita). */
  async setUserTenants(userId: string, tenantIds: string[]): Promise<{ agregadas: number; quitadas: number; movido_a: string | null }> {
    validateUUID(userId, 'userId');
    return apiFetch(`/users/${userId}/tenants`, {
      method: 'PUT',
      body: JSON.stringify({ tenant_ids: tenantIds }),
    });
  },

  /** Tiendas que maneja el usuario actual (para elegir al crear otro). */
  async managedTenants(base?: string | null): Promise<Array<{ id: string; name: string }>> {
    // `base`: negocio donde se crea el usuario. Define qué tiendas se ofrecen:
    // a un cliente de la cartera de un contador, solo las suyas.
    return apiFetch(`/users/managed-tenants${base ? `?base=${encodeURIComponent(base)}` : ''}`);
  },

  async deleteUser(userId: string): Promise<void> {
    validateUUID(userId, 'userId');
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
  },

  /**
   * Cambia el correo con el que la persona INICIA SESIÓN.
   *
   * Se acepta también un nombre de usuario sin arroba: el servidor le agrega el
   * dominio interno, igual que al crearlo.
   */
  async changeEmail(userId: string, email: string): Promise<{ email: string; message?: string }> {
    validateUUID(userId, 'userId');
    return apiFetch<{ email: string; message?: string }>(`/users/${userId}/email`, {
      method: 'PUT',
      body: JSON.stringify({ email }),
    });
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
