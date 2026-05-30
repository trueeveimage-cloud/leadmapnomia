// Returns the email address of the connected Gmail account.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GMAIL_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY || !GMAIL_KEY) {
    return json({ connected: false, error: 'Gmail not connected' });
  }

  try {
    const resp = await fetch(`${GATEWAY_URL}/users/me/profile`, {
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GMAIL_KEY,
      },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ connected: false, error: data?.error?.message || 'Gmail profile fetch failed' });
    }
    return json({ connected: true, emailAddress: data.emailAddress, messagesTotal: data.messagesTotal });
  } catch (e: any) {
    return json({ connected: false, error: e?.message || 'unknown' });
  }
});
