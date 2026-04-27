import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No autorizado: falta Authorization header');

    // Verify valid session
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authCheckError } = await supabaseClient.auth.getUser();
    if (authCheckError) throw new Error(`Auth check error: ${authCheckError.message}`);
    if (!user) throw new Error('No autorizado: sesión inválida');

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, password, businessName, planId, withDemo } = await req.json();

    if (!email || !password || !businessName) {
      throw new Error('Faltan campos requeridos: email, password, businessName');
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: businessName, role: 'owner' },
    });

    if (authError) throw new Error(`Auth error: ${authError.message}`);
    const userId = authData.user!.id;

    // 2. Wait for DB trigger, then upsert into public.users if needed
    await new Promise((r) => setTimeout(r, 1500));

    const { data: userExists } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (!userExists) {
      const { error: insertError } = await supabaseAdmin.from('users').insert({
        id: userId,
        email,
        full_name: businessName,
        role: 'owner',
        business_name: businessName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertError) throw new Error(`Insert users error: ${insertError.message}`);
    }

    // 3. Create tenant
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: businessName,
        owner_id: userId,
        is_demo: withDemo ?? false,
        status: 'active',
        schema_name: `tenant_${userId.replace(/-/g, '_')}`,
      })
      .select()
      .single();

    if (tenantError) throw new Error(`Tenant error: ${tenantError.message}`);

    // 4. Update user with tenant_id
    await supabaseAdmin
      .from('users')
      .update({ tenant_id: tenantData.id })
      .eq('id', userId);

    // 5. Create subscription if plan selected
    if (planId) {
      // Calculate ends_at based on billing_cycle (match plansService.createSubscription)
      const { data: planData } = await supabaseAdmin
        .from('subscription_plans')
        .select('billing_cycle')
        .eq('id', planId)
        .single();

      let endsAt = null;
      if (withDemo) {
        endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (planData?.billing_cycle === 'monthly') {
        endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (planData?.billing_cycle === 'yearly') {
        endsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { data: subData, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          tenant_id: tenantData.id,
          plan_id: planId,
          status: withDemo ? 'inactive' : 'active',
          ends_at: endsAt,
          auto_renew: !withDemo,
        })
        .select()
        .single();

      if (subError) throw new Error(`Subscription error: ${subError.message}`);

      // Update tenant with subscription_id and plan_id (same as plansService.createSubscription)
      await supabaseAdmin
        .from('tenants')
        .update({ subscription_id: subData.id, plan_id: planId })
        .eq('id', tenantData.id);
    }

    return new Response(
      JSON.stringify({ success: true, userId, tenantId: tenantData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('admin-create-owner error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
