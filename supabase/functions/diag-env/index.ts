const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const required = [
    'LOVABLE_API_KEY',
    'GOOGLE_MAIL_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
    'RETELL_API_KEY',
    'RETELL_AGENT_ID',
    'RETELL_FROM_NUMBER',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'GOOGLE_PLACES_API_KEY',
  ];
  const secrets: Record<string, { present: boolean; len: number }> = {};
  for (const k of required) {
    const v = Deno.env.get(k) || '';
    secrets[k] = { present: !!v, len: v.length };
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown';
  const missing = Object.entries(secrets).filter(([_, v]) => !v.present).map(([k]) => k);
  return new Response(JSON.stringify({
    ok: missing.length === 0,
    project_ref: projectRef,
    supabase_url: supabaseUrl,
    missing,
    secrets,
    checked_at: new Date().toISOString(),
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
