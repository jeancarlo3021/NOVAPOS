// Types for the Users module

export interface User {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
  full_name: string;
  phone?: string;
  created_at: string;
}

export type UserRole =
  | 'owner' | 'admin' | 'gerente'
  | 'asistente_1' | 'asistente_2' | 'asistente_3'
  | 'cocinero' | 'mesero' | 'cajero' | 'almacenero' | 'contador';

export const USER_ROLES: Record<UserRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  gerente: 'Gerente',
  asistente_1: 'Asistente 1',
  asistente_2: 'Asistente 2',
  asistente_3: 'Asistente 3',
  cocinero: 'Cocinero',
  mesero: 'Mesero',
  cajero: 'Cajero',
  almacenero: 'Almacenero',
  contador: 'Contador',
};

export type UserModule =
  | 'pos' | 'inventory' | 'reports' | 'expenses'
  | 'purchases' | 'users' | 'promotions' | 'accounts_payable' | 'hr';

export interface UserPermission {
  id: string;
  tenant_id: string;
  user_id: string;
  module: UserModule;
  can_access: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
}

export interface UserPermissionMatrix {
  [module: string]: {
    can_access: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  };
}

export interface ActivityLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  user_name?: string;
  action: string; // 'login', 'invoice_created', 'user_created', etc.
  entity_type?: string; // 'invoice', 'purchase', 'user', etc.
  entity_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface Team {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  color: string; // hex color code
  created_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  added_at: string;
  users?: User; // relationship from backend
}

export interface Shift {
  id: string;
  tenant_id: string;
  user_id?: string;
  team_id?: string;
  start_datetime: string; // ISO datetime
  end_datetime?: string; // ISO datetime
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
  users?: User; // relationship from backend
  teams?: Team; // relationship from backend
}

// Form data types

export interface CreateUserFormData {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  phone?: string;
}

export interface UpdateUserFormData {
  full_name?: string;
  role?: UserRole;
  phone?: string;
}

export interface CreateTeamFormData {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateTeamFormData {
  name?: string;
  description?: string;
  color?: string;
}

export interface CreateShiftFormData {
  user_id?: string;
  team_id?: string;
  start_datetime: string;
  end_datetime?: string;
  status?: 'scheduled' | 'active' | 'completed' | 'cancelled';
  notes?: string;
}

export interface UpdateShiftFormData {
  user_id?: string;
  team_id?: string;
  start_datetime?: string;
  end_datetime?: string;
  status?: 'scheduled' | 'active' | 'completed' | 'cancelled';
  notes?: string;
}
