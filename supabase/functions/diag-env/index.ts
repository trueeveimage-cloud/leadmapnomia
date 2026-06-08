import { requireCronServiceOrUserJwt } from '../_shared/auth.ts';
Deno.serve(async (req) => {
  const fail = await requireCronServiceOrUserJwt(req, {});
  if (fail) return new Response('outer-fail', { status: 401 });
  // Now call self with service key:
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/diag-env`;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return new Response(JSON.stringify({ innerStatus: r.status, body: (await r.text()).slice(0,400) }), { headers: { 'Content-Type': 'application/json' } });
});
