import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error, count } = await sb
    .from('leads')
    .select('id, name, email, lead_tier, outreach_stage, outreach_state', { count: 'exact' })
    .not('email', 'is', null)
    .neq('email', '')
    .or('outreach_opt_out.is.null,outreach_opt_out.eq.false')
    .or('do_not_contact.is.null,do_not_contact.eq.false')
    .in('lead_tier', ['S','A+','A'])
    .order('potential_score', { ascending: false, nullsFirst: false })
    .limit(5);
  return new Response(JSON.stringify({ count, error: error?.message, sample: data }), { headers: { 'Content-Type': 'application/json' } });
});
