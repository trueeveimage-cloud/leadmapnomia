Deno.serve(async () => {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/retell-start-call`;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ leadId: '00000000-0000-0000-0000-000000000000' }),
  });
  const text = await r.text();
  return new Response(JSON.stringify({ status: r.status, body: text.slice(0,300), keyPrefix: serviceKey.slice(0,40) }), { headers: { 'Content-Type': 'application/json' } });
});
