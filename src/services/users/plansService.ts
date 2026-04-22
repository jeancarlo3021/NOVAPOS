import { supabase } from '@/lib/supabase';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  max_users: number;
  max_products: number;
  max_orders: number;
  features: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  ends_at?: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export const plansService = {
  // Obtener todos los planes
  async getAllPlans() {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Obtener plan por ID
  async getPlanById(planId: string) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Obtener suscripción de un tenant
  async getTenantSubscription(tenantId: string) {
    const { data: rows, error } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) return null;
    return rows?.[0] ?? null;
  },

  // Crear suscripción
  async createSubscription(tenantId: string, planId: string, isDemo: boolean = false) {
    const plan = await plansService.getPlanById(planId);

    let endsAt = null;
    if (isDemo) {
      // Demo por 30 días
      endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (plan.billing_cycle === 'monthly') {
      endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (plan.billing_cycle === 'yearly') {
      endsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert([
        {
          tenant_id: tenantId,
          plan_id: planId,
          status: 'active',
          ends_at: endsAt,
          auto_renew: !isDemo,
        },
      ])
      .select();

    if (error) throw error;

    // Actualizar tenant con subscription_id
    await supabase
      .from('tenants')
      .update({ subscription_id: data[0].id, plan_id: planId })
      .eq('id', tenantId);

    return data[0];
  },

  // Cambiar plan de un tenant
async changePlan(tenantId: string, newPlanId: string) {
  console.log('🔄 [changePlan] Iniciando...');
  console.log('  tenantId:', tenantId);
  console.log('  newPlanId:', newPlanId);

  try {
    // 1️⃣ Buscar suscripción existente
    const { data: rows, error: subError } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (subError) throw subError;

    const subscription = rows?.[0] ?? null;
    console.log('  Suscripción encontrada:', subscription);

    if (subscription) {
      // 2️⃣ ACTUALIZAR (sin .select() para evitar problemas de RLS)
      console.log('  📝 Actualizando suscripción:', subscription.id);
      
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ 
          plan_id: newPlanId,
          status: 'active',
          updated_at: new Date().toISOString() 
        })
        .eq('id', subscription.id);

      if (updateError) {
        console.error('  ❌ Error al actualizar:', updateError);
        throw updateError;
      }

      console.log('  ✅ Suscripción actualizada');

      // 3️⃣ VERIFICAR que se actualizó (query separada)
      const { data: verified } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('id', subscription.id)
        .maybeSingle();

      console.log('  🔍 Verificación - plan_id ahora es:', verified?.plan_id);
      
      if (verified?.plan_id !== newPlanId) {
        console.warn('  ⚠️ ADVERTENCIA: El plan_id no cambió en la BD!');
        console.warn('     Esperado:', newPlanId);
        console.warn('     Actual:', verified?.plan_id);
      }
    } else {
      // 4️⃣ CREAR nueva suscripción si no existe
      console.log('  📝 Creando nueva suscripción...');
      
      const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          tenant_id: tenantId,
          plan_id: newPlanId,
          status: 'active',
          ends_at: endsAt,
          auto_renew: true
        });

      if (insertError) {
        console.error('  ❌ Error al insertar:', insertError);
        throw insertError;
      }

      console.log('  ✅ Suscripción creada');
    }

    // 5️⃣ Actualizar tenant
    console.log('  📝 Actualizando tenant...');
    
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({ plan_id: newPlanId })
      .eq('id', tenantId);

    if (tenantError) {
      console.error('  ❌ Error al actualizar tenant:', tenantError);
      throw tenantError;
    }

    console.log('  ✅ Tenant actualizado');
    console.log('✅ [changePlan] Completado exitosamente');
  } catch (error) {
    console.error('❌ [changePlan] Error:', error);
    throw error;
  }
},

  // Cancelar suscripción
  async cancelSubscription(subscriptionId: string) {
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', subscriptionId);

    if (error) throw error;
  },

  // Obtener estadísticas de tenants
  async getTenantStats() {
    const { data, error } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        owner_id,
        is_demo,
        status,
        created_at,
        subscriptions(
          status,
          subscription_plans(name, price)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};