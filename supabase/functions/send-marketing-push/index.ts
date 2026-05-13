import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MarketingPushPayload = {
  id?: string;
  title?: string;
  message?: string;
  audience?: string;
};

const isExpoPushToken = (token: string) =>
  token.startsWith('ExpoPushToken[') || token.startsWith('ExponentPushToken[');

type ExpoPushMessage = {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

/** Expo rejects one HTTP request mixing tokens from different projects (PUSH_TOO_MANY_EXPERIENCE_IDS). One message per request avoids that (e.g. after changing EAS owner / projectId). */
const sendExpoPushOnePerRequest = async (messages: ExpoPushMessage[]) => {
  let sent = 0;
  const errors: string[] = [];
  const concurrency = 20;

  const sendOne = async (msg: ExpoPushMessage) => {
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([msg]),
    });
    if (expoResponse.ok) {
      const expoResult = await expoResponse.json().catch(() => null);
      const tickets = Array.isArray(expoResult?.data) ? expoResult.data : [];
      let ok = 0;
      for (const ticket of tickets) {
        if (ticket?.status === 'ok') ok += 1;
        else errors.push(ticket?.details?.error || ticket?.message || 'Expo push error');
      }
      return ok;
    }
    errors.push(await expoResponse.text());
    return 0;
  };

  for (let i = 0; i < messages.length; i += concurrency) {
    const slice = messages.slice(i, i + concurrency);
    const counts = await Promise.all(slice.map(sendOne));
    sent += counts.reduce((a, b) => a + b, 0);
  }

  return { sent, errors };
};

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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: 'Missing Supabase secrets' }, { status: 500, headers: corsHeaders });
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
  if (!adminProfile || !['admin', 'manager'].includes(adminProfile.role as string)) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  const payload = (await req.json()) as MarketingPushPayload;
  const title = payload.title?.trim();
  const message = payload.message?.trim();
  const audience = payload.audience?.trim() || 'Tous les clients';
  if (!title || !message) {
    return Response.json({ error: 'Title and message are required' }, { status: 400, headers: corsHeaders });
  }

  let profileQuery = serviceClient
    .from('profiles')
    .select('id')
    .eq('marketing_push_consent', true)
    .limit(500);

  if (audience === 'Lille') {
    profileQuery = profileQuery.eq('preferred_restaurant_id', 'lille');
  }
  if (audience === 'Armentières') {
    profileQuery = profileQuery.eq('preferred_restaurant_id', 'armentieres');
  }
  if (audience === 'Clients fidèles') {
    const { data: loyalAccounts } = await serviceClient
      .from('loyalty_accounts')
      .select('user_id')
      .gte('total_spent', 50);
    const loyalIds = loyalAccounts?.map((account) => account.user_id) ?? [];
    if (!loyalIds.length) {
      await serviceClient.from('push_campaigns').insert({
        id: payload.id || `mkt-push-${Date.now()}`,
        title: `[Push] ${title}`,
        message,
        audience: `${audience} (0 jetons)`,
      });
      return Response.json({ ok: true, sent: 0, tokens: 0 }, { headers: corsHeaders });
    }
    profileQuery = profileQuery.in('id', loyalIds);
  }

  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500, headers: corsHeaders });
  }

  const userIds = (profiles ?? []).map((row) => row.id).filter(Boolean);
  if (!userIds.length) {
    await serviceClient.from('push_campaigns').insert({
      id: payload.id || `mkt-push-${Date.now()}`,
      title: `[Push] ${title}`,
      message,
      audience: `${audience} (0 cibles)`,
    });
    return Response.json({ ok: true, sent: 0, tokens: 0 }, { headers: corsHeaders });
  }

  const { data: tokenRows, error: tokenError } = await serviceClient
    .from('marketing_push_tokens')
    .select('token')
    .in('user_id', userIds)
    .eq('enabled', true);

  if (tokenError) {
    return Response.json({ error: tokenError.message }, { status: 500, headers: corsHeaders });
  }

  const tokens = [
    ...new Set(
      (tokenRows ?? [])
        .map((row) => row.token as string)
        .filter((t) => t && isExpoPushToken(t)),
    ),
  ];

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body: message,
    data: { type: 'marketing_offer' },
  }));

  const { sent, errors } = await sendExpoPushOnePerRequest(messages);

  await serviceClient.from('push_campaigns').insert({
    id: payload.id || `mkt-push-${Date.now()}`,
    title: `[Push] ${title}`,
    message,
    audience: `${audience} · ${tokens.length} jeton(s) · envois ${sent}`,
  });

  return Response.json({ ok: true, sent, tokens: tokens.length, errors: [...new Set(errors)].slice(0, 5) }, { headers: corsHeaders });
});
