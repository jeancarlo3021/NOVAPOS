import { supabase } from '@/lib/supabase';
import { tenantsService } from './tenantsService';

export const authService = {
  // Login con usuario o email
  async login(emailOrUsername: string, password: string) {
    const email = emailOrUsername.includes('@') 
      ? emailOrUsername 
      : `${emailOrUsername}@nexoerp.local`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Obtener datos del usuario
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError) throw userError;

    return { user: data.user, userData };
  },

  // Logout
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Obtener usuario actual
  async getCurrentUser() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return null;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (userError) return null;

    return { user: session.user, userData };
  },

  // Crear usuario owner con su tenant
  async createOwnerUser(username: string, password: string, businessName: string) {
    const email = `${username}@nexoerp.local`;

    // Crear usuario en Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) throw error;

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

    // Crear tenant para el owner
    const tenant = await tenantsService.createTenant(data.user.id, businessName, false);

    // Actualizar usuario con tenant_id
    await supabase
      .from('users')
      .update({ tenant_id: tenant.id })
      .eq('id', data.user.id);

    return { user: data.user, tenant };
  },

  // Crear usuario owner con tenant de demo
  async createOwnerWithDemo(username: string, password: string, businessName: string) {
    const email = `${username}@nexoerp.local`;

    // Crear usuario en Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) throw error;

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

    // Crear tenant principal
    const tenant = await tenantsService.createTenant(data.user.id, businessName, false);

    // Crear tenant de demo
    const demoTenant = await tenantsService.createDemoTenant(data.user.id);

    // Actualizar usuario con tenant_id (el principal)
    await supabase
      .from('users')
      .update({ tenant_id: tenant.id })
      .eq('id', data.user.id);

    return { user: data.user, tenant, demoTenant };
  },

  // Verificar si el usuario es owner
  async isOwner(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data?.role === 'owner';
  },
};
