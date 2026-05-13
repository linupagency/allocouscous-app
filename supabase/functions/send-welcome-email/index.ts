import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type WelcomePayload = {
  customer?: {
    firstName?: string;
    name?: string;
    email?: string;
    preferredRestaurant?: string;
    marketingConsent?: boolean;
  };
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
  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: 'Missing Supabase configuration' }, { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Allo Couscous <contact@allocouscous.fr>';
  if (!resendApiKey) {
    return Response.json({ error: 'RESEND_API_KEY is missing' }, { status: 500, headers: corsHeaders });
  }

  const payload = (await req.json()) as WelcomePayload;
  const customer = payload.customer;
  const email = customer?.email?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: 'Customer email is required' }, { status: 400, headers: corsHeaders });
  }

  const sessionEmail = userData.user.email?.trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== email) {
    return Response.json({ error: 'Email does not match authenticated user' }, { status: 403, headers: corsHeaders });
  }

  const firstName = customer?.firstName?.trim();
  const name = firstName || customer?.name?.trim() || 'Bonjour';
  const restaurant = customer?.preferredRestaurant || 'Allo Couscous';
  const safeName = escapeHtml(name);
  const safeRestaurant = escapeHtml(restaurant);
  const marketingLine = customer?.marketingConsent
    ? '<p style="margin:18px 0 0;">Vous recevrez nos offres du moment, menus du week-end et avantages fidélité.</p>'
    : '<p style="margin:18px 0 0;">Vous pourrez activer les offres par email depuis votre profil à tout moment.</p>';

  const html = `
    <div style="display:none; max-height:0; overflow:hidden;">
      Votre compte Allo Couscous est prêt pour commander en click & collect.
    </div>
    <div style="font-family: Arial, sans-serif; color:#1f2937; line-height:1.5; max-width:620px; margin:0 auto; background:#ffffff;">
      <div style="background:#ad1b1f; color:#fff; padding:30px 28px; border-radius:14px 14px 0 0; text-align:center;">
        <div style="font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:.9;">Allo Couscous</div>
        <h1 style="margin:8px 0 0; font-size:28px;">Bienvenue ${safeName}</h1>
        <p style="margin:10px 0 0; font-size:16px;">Votre compte click & collect est activé.</p>
      </div>
      <div style="border:1px solid #eadfd5; border-top:0; padding:26px; border-radius:0 0 14px 14px;">
        <p style="margin-top:0;">Votre espace client est prêt. Vous pouvez commander à emporter, suivre votre commande et retrouver votre historique.</p>
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:16px; margin:20px 0;">
          <strong>Votre restaurant préféré</strong>
          <p style="margin:8px 0 0;">${safeRestaurant}</p>
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;">
          <tr>
            <td style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:14px;">
              <strong>Click & collect</strong><br />
              <span style="color:#6b7280;">Paiement au retrait de la commande.</span>
            </td>
          </tr>
        </table>
        <div style="background:#1f2937; color:#fff; border-radius:12px; padding:16px; margin:20px 0;">
          <strong>Programme fidélité</strong>
          <p style="margin:8px 0 0;">10 points = 10 € de réduction.</p>
        </div>
        ${marketingLine}
        <p style="margin-top:24px;">À très bientôt,<br />L’équipe Allo Couscous</p>
      </div>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: 'Bienvenue chez Allo Couscous',
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json({ error: 'Resend rejected the welcome email', detail }, { status: 502, headers: corsHeaders });
  }

  return Response.json({ ok: true }, { headers: corsHeaders });
});
