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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authCheckError } = await supabaseClient.auth.getUser();
    if (authCheckError) throw new Error(`Auth check error: ${authCheckError.message}`);
    if (!user) throw new Error('No autorizado: sesión inválida');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { tenantId, ownerId } = await req.json();

    if (!tenantId || !ownerId) {
      throw new Error('Faltan campos requeridos: tenantId, ownerId');
    }

    // 1. Delete subscriptions
    const { error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .delete()
      .eq('tenant_id', tenantId);
    if (subErr) throw new Error(`Subscriptions error: ${subErr.message}`);

    // 2. Delete tenant
    const { error: tErr } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenantId);
    if (tErr) throw new Error(`Tenant error: ${tErr.message}`);

    // 3. Delete from public.users
    const { error: userErr } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', ownerId);
    if (userErr) throw new Error(`Users error: ${userErr.message}`);

    // 4. Delete from auth
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(ownerId);
    if (authErr) throw new Error(`Auth delete error: ${authErr.message}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('admin-delete-owner error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
