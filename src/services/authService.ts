import { supabase } from '@/lib/supabase';

// ============================================
// INTERFACES
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name?: string;
  business_name?: string;
  tenant_id?: string;
}

export interface LoginResponse {
  user: AuthUser;
  session: any;
}

// ============================================
// LOGIN FUNCTION
// ============================================

export async function login(
  emailOrUsername: string,
  password: string
): Promise<LoginResponse> {
  try {
    const email = emailOrUsername.includes('@')
      ? emailOrUsername
      : `${emailOrUsername}@nexoerp.local`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('No user data returned');

    // Obtener datos del usuario
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, role, full_name, business_name, tenant_id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (userError) throw userError;
    if (!userData) throw new Error('User not found in database');

    return {
      user: userData as AuthUser,
      session: data.session,
    };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// ============================================
// LOGOUT FUNCTION
// ============================================

export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// ============================================
// GET CURRENT USER
// ============================================

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;
    if (!session?.user) return null;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, role, full_name, business_name, tenant_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (userError) {
      console.error('Error getting user data:', userError);
      return null;
    }

    return userData as AuthUser;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

// ============================================
// GET SESSION
// ============================================

export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  } catch (error) {
    console.error('Get session error:', error);
    return null;
  }
}

// ============================================
// CREATE OWNER USER
// ============================================

export async function createOwnerUser(
  username: string,
  password: string,
  businessName: string
) {
  try {
    const email = `${username}@nexoerp.local`;

    // Crear usuario en Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) throw error;
    if (!data.user) throw new Error('No user data returned');

    // Crear registro en tabla users
    const { error: userError } = await supabase
      .from('users')
      .insert([
        {
          id: data.user.id,
          email,
          role: 'owner',
          business_name: businessName,
          full_name: username,
        },
      ]);

    if (userError) throw userError;

    // Obtener tenant del usuario (si existe)
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', data.user.id)
      .maybeSingle();

    let tenantId = tenantData?.id;

    // Si no existe tenant, crear uno
    if (!tenantId) {
      const { data: newTenant, error: tenantError } = await supabase
        .from('tenants')
        .insert([
          {
            owner_id: data.user.id,
            name: businessName,
            is_demo: false,
          },
        ])
        .select()
        .maybeSingle();

      if (tenantError) throw tenantError;
      tenantId = newTenant?.id;
    }

    // Actualizar usuario con tenant_id
    await supabase
      .from('users')
      .update({ tenant_id: tenantId })
      .eq('id', data.user.id);

    return {
      user: data.user,
      tenant: { id: tenantId, name: businessName },
    };
  } catch (error) {
    console.error('Create owner user error:', error);
    throw error;
  }
}

// ============================================
// IS OWNER
// ============================================

export async function isOwner(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data?.role === 'owner';
  } catch (error) {
    console.error('Is owner error:', error);
    return false;
  }
}

// ============================================
// CHANGE PASSWORD
// ============================================

export async function changePassword(newPassword: string) {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  } catch (error) {
    console.error('Change password error:', error);
    throw error;
  }
}

// ============================================
// RESET PASSWORD
// ============================================

export async function resetPassword(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) throw error;
  } catch (error) {
    console.error('Reset password error:', error);
    throw error;
  }
}

// ============================================
// UPDATE PROFILE
// ============================================

export async function updateProfile(
  userId: string,
  updates: Partial<AuthUser>
) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data as AuthUser;
  } catch (error) {
    console.error('Update profile error:', error);
    throw error;
  }
}

// ============================================
// GET USER BY ID
// ============================================

export async function getUserById(userId: string): Promise<AuthUser | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, role, full_name, business_name, tenant_id')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data as AuthUser;
  } catch (error) {
    console.error('Get user by ID error:', error);
    return null;
  }
}

// ============================================
// GET TENANT USERS
// ============================================

export async function getTenantUsers(tenantId: string): Promise<AuthUser[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, role, full_name, business_name, tenant_id')
      .eq('tenant_id', tenantId)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return (data || []) as AuthUser[];
  } catch (error) {
    console.error('Get tenant users error:', error);
    return [];
  }
}

// ============================================
// EMAIL EXISTS
// ============================================

export async function emailExists(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  } catch (error) {
    console.error('Email exists error:', error);
    return false;
  }
}

// ============================================
// USERNAME EXISTS
// ============================================

export async function usernameExists(username: string): Promise<boolean> {
  try {
    const email = `${username}@nexoerp.local`;
    return emailExists(email);
  } catch (error) {
    console.error('Username exists error:', error);
    return false;
  }
}

// ============================================
// AUTH SERVICE OBJECT (para compatibilidad)
// ============================================

export const authService = {
  login,
  logout,
  getCurrentUser,
  getSession,
  createOwnerUser,
  isOwner,
  changePassword,
  resetPassword,
  updateProfile,
  getUserById,
  getTenantUsers,
  emailExists,
  usernameExists,
};

export default authService;