Deno.serve(() => {
  const keys = ['LOVABLE_API_KEY', 'GOOGLE_MAIL_API_KEY', 'RETELL_AGENT_ID', 'RETELL_API_KEY', 'RETELL_FROM_NUMBER', 'SUPABASE_SERVICE_ROLE_KEY'];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = Deno.env.get(k) || '';
    out[k] = v ? `present (len=${v.length})` : 'MISSING';
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
