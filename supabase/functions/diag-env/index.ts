Deno.serve(() => {
  const keys = ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEYS','CRON_SECRET','SUPABASE_URL'];
  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = !!Deno.env.get(k);
  return new Response(JSON.stringify(present), { headers: { 'Content-Type': 'application/json' } });
});
