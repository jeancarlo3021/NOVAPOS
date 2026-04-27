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
    if (!authHeader) throw new Error('No autorizado');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !user) throw new Error('No autorizado: sesión inválida');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { tenantId, newPlanId } = await req.json();
    if (!tenantId || !newPlanId) throw new Error('Faltan campos: tenantId, newPlanId');

    // Get plan billing_cycle to calculate ends_at
    const { data: planData, error: planErr } = await supabaseAdmin
      .from('subscription_plans')
      .select('billing_cycle')
      .eq('id', newPlanId)
      .single();

    if (planErr) throw new Error(`Plan error: ${planErr.message}`);

    const endsAt = planData.billing_cycle === 'yearly'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Check for existing subscription
    const { data: rows } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1);

    const existing = rows?.[0] ?? null;

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('subscriptions')
        .update({ plan_id: newPlanId, status: 'active', ends_at: endsAt })
        .eq('id', existing.id);

      if (updateErr) throw new Error(`Update subscription error: ${updateErr.message}`);

      await supabaseAdmin
        .from('tenants')
        .update({ plan_id: newPlanId, subscription_id: existing.id })
        .eq('id', tenantId);
    } else {
      const { data: subData, error: insertErr } = await supabaseAdmin
        .from('subscriptions')
        .insert({ tenant_id: tenantId, plan_id: newPlanId, status: 'active', ends_at: endsAt, auto_renew: true })
        .select()
        .single();

      if (insertErr) throw new Error(`Insert subscription error: ${insertErr.message}`);

      await supabaseAdmin
        .from('tenants')
        .update({ plan_id: newPlanId, subscription_id: subData.id })
        .eq('id', tenantId);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('admin-change-plan error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
