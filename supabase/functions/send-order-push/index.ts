import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type OrderStatus = 'Acceptée' | 'Annulée' | 'Prête';

const getNotificationContent = (status: OrderStatus, orderId: string, refusalReason = '') => {
  if (status === 'Acceptée') {
    return {
      title: 'Commande acceptée',
      body: `Votre commande ${orderId} a été acceptée par le restaurant.`,
    };
  }
  if (status === 'Prête') {
    return {
      title: 'Commande prête',
      body: `Votre commande ${orderId} est prête à être retirée.`,
    };
  }
  return {
    title: 'Commande refusée',
    body: refusalReason || 'Le restaurant ne peut pas préparer cette commande.',
  };
};

type ExpoPushMessage = {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

/** One Expo HTTP request cannot mix push tokens from different EAS projects (PUSH_TOO_MANY_EXPERIENCE_IDS). */
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (profileError || !profile || !['kitchen', 'manager', 'admin'].includes(profile.role as string)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { orderId?: string; status?: string; refusalReason?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId, status, refusalReason } = body;
    if (!orderId || !['Acceptée', 'Annulée', 'Prête'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokensResponse = await fetch(
      `${supabaseUrl}/rest/v1/push_tokens?order_id=eq.${encodeURIComponent(orderId)}&enabled=eq.true&select=token`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!tokensResponse.ok) {
      throw new Error(await tokensResponse.text());
    }

    const rows = (await tokensResponse.json()) as { token: string }[];
    const tokens = [
      ...new Set(
        rows
          .map((row) => row.token)
          .filter((token) => token.startsWith('ExpoPushToken[') || token.startsWith('ExponentPushToken[')),
      ),
    ];
    if (!tokens.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = getNotificationContent(status as OrderStatus, orderId, refusalReason ?? '');
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: 'default',
      title: content.title,
      body: content.body,
      data: { orderId, status: status as string },
    }));

    const { sent, errors } = await sendExpoPushOnePerRequest(messages);

    return new Response(JSON.stringify({ sent, tokens: tokens.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
