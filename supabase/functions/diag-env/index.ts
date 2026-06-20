const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const keys = [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'LOVABLE_API_KEY',
    'GOOGLE_MAIL_API_KEY',
    'CRON_SECRET',
    'RETELL_AGENT_ID',
    'RETELL_API_KEY',
    'RETELL_FROM_NUMBER',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = Deno.env.get(k) || '';
    out[k] = v ? `present (len=${v.length})` : 'MISSING';
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
