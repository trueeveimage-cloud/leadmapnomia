import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error, count } = await sb
    .from('leads')
    .select('id, name, email, lead_tier, outreach_stage, outreach_state, last_called_at, outreach_opt_out, do_not_contact, potential_score', { count: 'exact' })
    .not('email', 'is', null)
    .neq('email', '')
    .in('lead_tier', ['S', 'A+', 'A'])
    .or('outreach_stage.is.null,outreach_stage.neq.email_sent')
    .is('last_called_at', null)
    .order('potential_score', { ascending: false, nullsFirst: false })
    .limit(1000);
  return new Response(JSON.stringify({ count, len: data?.length, error: error?.message, sample: data?.slice(0,3) }), { headers: { 'Content-Type': 'application/json' } });
});
