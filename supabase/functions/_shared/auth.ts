import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Validate an owner JWT from the Authorization header. Returns null on success, or a Response on failure. */
export async function requireUserJwt(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.slice(7).trim();
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data, error } = await sb.auth.getClaims(token);
    if (error || !data?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isOwner, error: ownerError } = await sb.rpc('is_crm_owner');
    if (ownerError || !isOwner) {
      return new Response(JSON.stringify({ error: 'Owner access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return null;
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/** Allow either a CRON_SECRET bearer token or the service-role key. Returns null on success, Response on failure. */
export function requireCronOrService(req: Request, corsHeaders: Record<string, string>): Response | null {
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  if (!provided || (provided !== serviceKey && (!cronSecret || provided !== cronSecret))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return null;
}

/** Allow scheduled/service calls, or an owner JWT from the CRM UI. */
export async function requireCronServiceOrUserJwt(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const cronOrServiceFail = requireCronOrService(req, corsHeaders);
  if (!cronOrServiceFail) return null;
  return await requireUserJwt(req, corsHeaders);
}
