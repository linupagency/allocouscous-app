import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MarketingPayload = {
  id?: string;
  title?: string;
  message?: string;
  audience?: string;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Allo Couscous <contact@allocouscous.fr>';
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) {
    return Response.json({ error: 'Missing Supabase or Resend secrets' }, { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: adminProfile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (!adminProfile || !['admin', 'manager'].includes(adminProfile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  const payload = (await req.json()) as MarketingPayload;
  const title = payload.title?.trim();
  const message = payload.message?.trim();
  const audience = payload.audience?.trim() || 'Tous les clients';
  if (!title || !message) {
    return Response.json({ error: 'Title and message are required' }, { status: 400, headers: corsHeaders });
  }

  let query = serviceClient
    .from('profiles')
    .select('id,email,full_name')
    .eq('marketing_consent', true)
    .neq('email', '')
    .limit(500);

  if (audience === 'Lille') {
    query = query.eq('preferred_restaurant_id', 'lille');
  }
  if (audience === 'Armentières') {
    query = query.eq('preferred_restaurant_id', 'armentieres');
  }
  if (audience === 'Clients fidèles') {
    const { data: loyalAccounts } = await serviceClient
      .from('loyalty_accounts')
      .select('user_id')
      .gte('total_spent', 50);
    const loyalIds = loyalAccounts?.map((account) => account.user_id) ?? [];
    if (!loyalIds.length) {
      await serviceClient.from('email_campaigns').insert({
        id: payload.id || `email-${Date.now()}`,
        title,
        message,
        audience,
        sent_count: 0,
      });
      return Response.json({ ok: true, sent: 0 }, { headers: corsHeaders });
    }
    query = query.in('id', loyalIds);
  }

  const { data: profiles, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br />');
  let sent = 0;
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const safeName = escapeHtml(profile.full_name || 'Bonjour');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: profile.email,
        subject: title,
        html: `
          <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
            <h1 style="color: #ad1b1f;">${safeTitle}</h1>
            <p>Bonjour ${safeName},</p>
            <p>${safeMessage}</p>
            <p style="margin-top: 24px;">À bientôt,<br />L’équipe Allo Couscous</p>
            <p style="color: #6b7280; font-size: 12px;">Vous recevez cet email car vous avez accepté les offres par email dans l’application.</p>
          </div>
        `,
      }),
    });
    if (response.ok) {
      sent += 1;
    }
  }

  await serviceClient.from('email_campaigns').insert({
    id: payload.id || `email-${Date.now()}`,
    title,
    message,
    audience,
    sent_count: sent,
  });

  return Response.json({ ok: true, sent }, { headers: corsHeaders });
});
