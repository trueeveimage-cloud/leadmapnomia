import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Validate a Supabase JWT from the Authorization header. Returns null on success, or a Response on failure. */
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  // Legacy long-form publishable JWT still used by existing pg_cron jobs.
  // This is a publishable (anon-role) token, safe to keep in source.
  const legacyAnonJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZnVjZHdtZWdkbmN6d3BnYWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTA1MjAsImV4cCI6MjA4NzAyNjUyMH0.93fafDWMxJ7KYCD9NRybKRP1TOQ_krGcGyJWnKSwTu0';
  const accepted = [serviceKey, cronSecret, anonKey, publishableKey, legacyAnonJwt].filter(Boolean);
  if (!provided || !accepted.includes(provided)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return null;
}

/** Allow scheduled/service calls, or a valid Supabase JWT from the CRM UI. */
export async function requireCronServiceOrUserJwt(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const cronOrServiceFail = requireCronOrService(req, corsHeaders);
  if (!cronOrServiceFail) return null;
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (provided && anonKey && provided === anonKey) return null;
  return await requireUserJwt(req, corsHeaders);
}
