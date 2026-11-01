import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Un error con código HTTP propio, para no responder 400 a todo. */
class ErrorHttp extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  /** Se recuerda para poder DESHACER si algo falla después de crearlo. */
  let userIdCreado: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new ErrorHttp('No autorizado: falta Authorization header', 401);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authCheckError } = await supabaseClient.auth.getUser();
    if (authCheckError) throw new ErrorHttp(`Auth check error: ${authCheckError.message}`, 401);
    if (!user) throw new ErrorHttp('No autorizado: sesión inválida', 401);

    /**
     * Crear negocios es del ADMINISTRADOR DE LA PLATAFORMA, no de cualquiera.
     *
     * Antes alcanzaba con tener sesión válida: el cajero de un negocio podía
     * llamar a esta función y crear negocios con el plan que quisiera. Se
     * comprueba lo mismo que el backend (`admin_dashboard` en el plan de alguno
     * de sus negocios; sin negocio propio, ser dueño de alguno).
     */
    const tenantIds = new Set<string>();
    const { data: yo } = await supabaseAdmin.from('users')
      .select('tenant_id').eq('id', user.id).maybeSingle();
    if ((yo as any)?.tenant_id) tenantIds.add(String((yo as any).tenant_id));
    const { data: vinculos } = await supabaseAdmin.from('user_tenants')
      .select('tenant_id').eq('user_id', user.id);
    for (const r of (vinculos ?? []) as any[]) if (r.tenant_id) tenantIds.add(String(r.tenant_id));

    let esAdmin = false;
    if (tenantIds.size > 0) {
      const { data: ts } = await supabaseAdmin.from('tenants')
        .select('plan_id').in('id', [...tenantIds]);
      const planIds = [...new Set((ts ?? []).map((t: any) => t.plan_id).filter(Boolean))];
      if (planIds.length) {
        const { data: ps } = await supabaseAdmin.from('subscription_plans')
          .select('features').in('id', planIds as string[]);
        esAdmin = (ps ?? []).some((p: any) => p?.features?.admin_dashboard === true);
      }
    } else {
      const { data: own } = await supabaseAdmin.from('tenants')
        .select('id').eq('owner_id', user.id).limit(1).maybeSingle();
      esAdmin = !!own;
    }
    if (!esAdmin) throw new ErrorHttp('Solo el administrador de la plataforma puede crear negocios', 403);

    const { email, password, businessName, planId, withDemo } = await req.json();

    if (!email || !password || !businessName) {
      throw new ErrorHttp('Faltan campos requeridos: email, password, businessName', 400);
    }
    const correo = String(email).trim().toLowerCase();
    if (String(password).length < 6) {
      throw new ErrorHttp('La contraseña tiene que tener al menos 6 caracteres', 400);
    }

    /**
     * ¿El correo ya está tomado? Se avisa ANTES de tocar nada.
     *
     * Y se distingue el caso que de verdad desconcierta: el correo existe en el
     * sistema de acceso pero NO tiene negocio —resto de un intento que falló a
     * mitad, o de un negocio borrado sin borrar su usuario—. Ahí el mensaje
     * «ya está registrado» no alcanza: no aparece en la lista de negocios, así
     * que parece un error del sistema.
     */
    const { data: yaEnUsers } = await supabaseAdmin.from('users')
      .select('id, tenant_id').eq('email', correo).maybeSingle();
    if (yaEnUsers) {
      throw new ErrorHttp(
        (yaEnUsers as any).tenant_id
          ? 'Ese correo ya tiene un negocio. Buscalo en la lista de negocios.'
          : 'Ese correo ya existe como usuario pero quedó SIN negocio (de un intento fallido o de un negocio borrado). Hay que borrar ese usuario antes de volver a usar el correo.',
        409,
      );
    }

    // 1. Usuario de acceso
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: correo,
      password,
      email_confirm: true,
      user_metadata: { full_name: businessName, role: 'owner' },
    });

    if (authError) {
      const m = authError.message.toLowerCase();
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
        throw new ErrorHttp(
          'Ese correo ya existe en el sistema de acceso, aunque no aparezca en la lista de negocios: '
          + 'quedó de un intento fallido o de un negocio borrado. Hay que borrar ese usuario (o usar otro correo).',
          409,
        );
      }
      throw new ErrorHttp(`Auth error: ${authError.message}`, 400);
    }
    userIdCreado = authData.user!.id;
    const userId = userIdCreado;

    // 2. Ficha en public.users. El disparador de la base puede haberla creado ya:
    //    `upsert` sirve para los dos casos y no hay que adivinar cuánto esperar.
    const { error: upsertError } = await supabaseAdmin.from('users').upsert({
      id: userId,
      email: correo,
      full_name: businessName,
      role: 'owner',
      business_name: businessName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (upsertError) throw new ErrorHttp(`Insert users error: ${upsertError.message}`, 400);

    // 3. El negocio
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

    if (tenantError) throw new ErrorHttp(`Tenant error: ${tenantError.message}`, 400);

    // 4. Vincular el dueño con su negocio
    const { error: linkError } = await supabaseAdmin
      .from('users')
      .update({ tenant_id: tenantData.id })
      .eq('id', userId);
    if (linkError) throw new ErrorHttp(`Vínculo usuario-negocio: ${linkError.message}`, 400);

    // 5. Suscripción, si se eligió plan
    if (planId) {
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

      if (subError) throw new ErrorHttp(`Subscription error: ${subError.message}`, 400);

      await supabaseAdmin
        .from('tenants')
        .update({ subscription_id: subData.id, plan_id: planId })
        .eq('id', tenantData.id);
    }

    // `tenantId` y `tenant_id`: el panel lee el negocio recién creado para
    // ponerle el plan de FE, el teléfono de avisos y el régimen.
    return json({ success: true, userId, tenantId: tenantData.id, tenant_id: tenantData.id });
  } catch (err: any) {
    const status = err instanceof ErrorHttp ? err.status : 400;
    let motivo = err?.message ?? 'Error desconocido';

    /**
     * Si ya se había creado el usuario de acceso, se BORRA.
     *
     * Era la trampa de esta función: fallaba al crear el negocio o la
     * suscripción y el usuario quedaba vivo. El correo quedaba quemado —todo
     * intento siguiente respondía «ya está registrado»— y el negocio no
     * existía, así que no había desde dónde borrarlo en el panel.
     */
    if (userIdCreado) {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userIdCreado);
      motivo += delErr
        ? ` — ADEMÁS quedó el usuario ${userIdCreado} sin negocio y no se pudo borrar (${delErr.message}): el correo queda ocupado.`
        : ' — no quedó nada a medias: se puede volver a intentar con el mismo correo.';
    }

    console.error('admin-create-owner error:', motivo);
    return json({ error: motivo }, status);
  }
});
