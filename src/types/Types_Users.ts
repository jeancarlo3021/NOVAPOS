// Types for the Users module

export interface User {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
  full_name: string;
  phone?: string;
  zone?: string | null;
  ticket_alias?: string | null;   // "Atendido por:" en el ticket (control interno)
  created_at: string;
  /** Última vez que el usuario inició sesión. Viene de auth.users.last_sign_in_at
   *  o de un trigger que actualiza public.users.last_login_at. Opcional para
   *  retro-compatibilidad: si la columna no existe aún, la UI muestra "—". */
  last_login_at?: string | null;
}

export type UserRole =
  | 'owner' | 'admin' | 'gerente'
  | 'asistente_1' | 'asistente_2' | 'asistente_3'
  | 'cocinero' | 'mesero' | 'cajero' | 'almacenero' | 'contador' | 'repartidor';

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
  repartidor: 'Repartidor',
};

// Metadatos visuales por rol (color del badge, descripción, jerarquía)
export interface RoleMeta {
  label: string;
  color: string;        // tailwind color
  emoji: string;
  description: string;
  level: number;        // jerarquía: 100=owner, 0=básico
}

export const ROLE_META: Record<UserRole, RoleMeta> = {
  owner: {
    label: 'Propietario',
    color: 'purple',
    emoji: '👑',
    description: 'Acceso total al sistema. Único que puede gestionar el plan.',
    level: 100,
  },
  admin: {
    label: 'Administrador',
    color: 'red',
    emoji: '🛡️',
    description: 'Gestión completa del negocio: usuarios, configuración, reportes.',
    level: 90,
  },
  gerente: {
    label: 'Gerente',
    color: 'orange',
    emoji: '💼',
    description: 'Supervisa operaciones, aprueba gastos y ve reportes.',
    level: 80,
  },
  asistente_1: {
    label: 'Asistente 1',
    color: 'blue',
    emoji: '⭐',
    description: 'Asistente principal con permisos amplios de operación.',
    level: 70,
  },
  asistente_2: {
    label: 'Asistente 2',
    color: 'sky',
    emoji: '⭐',
    description: 'Asistente con permisos intermedios.',
    level: 60,
  },
  asistente_3: {
    label: 'Asistente 3',
    color: 'cyan',
    emoji: '⭐',
    description: 'Asistente con permisos básicos.',
    level: 50,
  },
  cajero: {
    label: 'Cajero',
    color: 'emerald',
    emoji: '💵',
    description: 'Maneja el POS, cobros y cierre de caja.',
    level: 40,
  },
  mesero: {
    label: 'Mesero',
    color: 'teal',
    emoji: '🍽️',
    description: 'Toma órdenes y atiende mesas.',
    level: 30,
  },
  cocinero: {
    label: 'Cocinero',
    color: 'amber',
    emoji: '👨‍🍳',
    description: 'Prepara productos. Recibe comandas de cocina.',
    level: 20,
  },
  almacenero: {
    label: 'Almacenero',
    color: 'yellow',
    emoji: '📦',
    description: 'Gestiona inventario, recibe compras y ajusta stock.',
    level: 25,
  },
  contador: {
    label: 'Contador',
    color: 'violet',
    emoji: '📊',
    description: 'Acceso de solo-lectura a reportes financieros y cierres.',
    level: 35,
  },
  repartidor: {
    label: 'Repartidor',
    color: 'cyan',
    emoji: '🚚',
    description: 'Reparte en camión: vende lo que lleva y entrega pedidos.',
    level: 30,
  },
};

// Roles considerados "managers" para temas de permisos en otros módulos
export const MANAGER_ROLES: UserRole[] = ['owner', 'admin', 'gerente'];

// Módulos del plan SaaS que cada rol *necesita* para tener sentido.
// Si el plan del owner no incluye ninguno de estos, el rol queda oculto al
// crear usuarios (no servirá para nada).
//
// Ejemplo: si el plan no incluye `hr`, el rol "contador" sólo se ofrece si
// reports también está activo (sigue sirviendo para revisar finanzas).
export const ROLE_REQUIRED_FEATURES: Record<UserRole, string[]> = {
  owner:       [],                          // siempre disponible
  admin:       [],                          // siempre disponible
  gerente:     ['pos', 'inventory', 'reports'],
  asistente_1: ['pos', 'inventory'],
  asistente_2: ['pos', 'inventory'],
  asistente_3: ['pos'],
  cocinero:    ['tables'],                  // solo si hay mapa de mesas
  mesero:      ['tables'],                  // solo si hay mapa de mesas
  cajero:      ['pos'],
  almacenero:  ['inventory', 'purchases'],
  contador:    ['reports', 'expenses', 'accounts_payable'],
  repartidor:  ['distribution'],            // solo si el plan tiene Distribución
};

export type UserModule =
  | 'pos' | 'inventory' | 'reports' | 'expenses'
  | 'purchases' | 'users' | 'promotions' | 'accounts_payable' | 'hr'
  | 'customers' | 'restaurant' | 'recipes' | 'distribution';

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
  zone?: string;
}

export interface UpdateUserFormData {
  full_name?: string;
  role?: UserRole;
  phone?: string;
  zone?: string;
  ticket_alias?: string;
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
