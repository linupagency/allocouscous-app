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

const buildMarketingEmailHtml = ({
  title,
  message,
  customerName,
  appUrl,
}: {
  title: string;
  message: string;
  customerName: string;
  appUrl: string;
}) => {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br />');
  const safeName = escapeHtml(customerName || 'cher client');
  const safeAppUrl = escapeHtml(appUrl);

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0; padding:0; background:#f5f2ee; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      Une offre Allo Couscous vous attend en click and collect.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2ee; margin:0; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border-radius:22px; overflow:hidden; box-shadow:0 14px 40px rgba(31,41,55,0.14);">
            <tr>
              <td style="background:#b71820; padding:30px 28px 26px; text-align:center;">
                <div style="display:inline-block; border:2px solid rgba(255,255,255,0.42); border-radius:999px; padding:10px 18px; color:#ffffff; font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
                  Allo Couscous
                </div>
                <h1 style="margin:22px 0 0; color:#ffffff; font-size:34px; line-height:1.08; font-weight:800;">
                  ${safeTitle}
                </h1>
                <p style="margin:12px 0 0; color:#ffe7e7; font-size:16px; line-height:1.5;">
                  Click and collect, paiement au retrait de la commande.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <p style="margin:0 0 18px; color:#374151; font-size:17px; line-height:1.55;">
                  Bonjour ${safeName},
                </p>
                <div style="background:#fff8f1; border:1px solid #f1d5bf; border-radius:18px; padding:24px; margin:0 0 24px;">
                  <p style="margin:0; color:#1f2937; font-size:22px; line-height:1.45; font-weight:700;">
                    ${safeMessage}
                  </p>
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 26px;">
                  <tr>
                    <td align="center" style="background:#b71820; border-radius:14px;">
                      <a href="${safeAppUrl}" style="display:inline-block; padding:15px 34px; color:#ffffff; font-size:17px; line-height:1; font-weight:800; text-decoration:none;">
                        Commander maintenant
                      </a>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #eadfd8; border-bottom:1px solid #eadfd8; margin:0 0 24px;">
                  <tr>
                    <td width="33.33%" style="padding:16px 8px; text-align:center;">
                      <div style="color:#b71820; font-size:20px; font-weight:800;">1</div>
                      <div style="color:#6b7280; font-size:13px; line-height:1.3;">Choisissez<br />votre plat</div>
                    </td>
                    <td width="33.33%" style="padding:16px 8px; text-align:center; border-left:1px solid #eadfd8; border-right:1px solid #eadfd8;">
                      <div style="color:#b71820; font-size:20px; font-weight:800;">2</div>
                      <div style="color:#6b7280; font-size:13px; line-height:1.3;">Réservez<br />votre créneau</div>
                    </td>
                    <td width="33.33%" style="padding:16px 8px; text-align:center;">
                      <div style="color:#b71820; font-size:20px; font-weight:800;">3</div>
                      <div style="color:#6b7280; font-size:13px; line-height:1.3;">Payez<br />au retrait</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px; color:#1f2937; font-size:16px; line-height:1.5; font-weight:700;">
                  À bientôt,
                </p>
                <p style="margin:0 0 24px; color:#4b5563; font-size:15px; line-height:1.5;">
                  L’équipe Allo Couscous
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc; padding:18px 28px; text-align:center;">
                <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.5;">
                  Vous recevez cet email car vous avez accepté les offres par email dans l’application Allo Couscous.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Allo Couscous <contact@allocouscous.fr>';
  const appUrl = `https://${(Deno.env.get('EXPO_PUBLIC_APP_DOMAIN') || Deno.env.get('APP_DOMAIN') || 'app.allocouscous.fr').replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
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

  let sent = 0;
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const customerName = profile.full_name || 'cher client';
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
        html: buildMarketingEmailHtml({ title, message, customerName, appUrl }),
        text: `Bonjour ${customerName},\n\n${message}\n\nCommander : ${appUrl}\n\nÀ bientôt,\nL'équipe Allo Couscous\n\nVous recevez cet email car vous avez accepté les offres par email dans l'application Allo Couscous.`,
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
