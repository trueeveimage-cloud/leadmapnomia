Deno.serve((req) => {
  const auth = req.headers.get('authorization') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return new Response(JSON.stringify({
    receivedAuthPrefix: auth.slice(0, 60),
    servicePrefix: service.slice(0, 60),
    match: auth === `Bearer ${service}`,
  }), { headers: { 'Content-Type': 'application/json' } });
});
