import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type HealthData = {
  ok: boolean;
  project_ref: string;
  supabase_url: string;
  missing: string[];
  secrets: Record<string, { present: boolean; len: number }>;
  checked_at: string;
};

const REQUIRED_SECRETS_LABELS: Record<string, string> = {
  LOVABLE_API_KEY: "Lovable AI Gateway",
  GOOGLE_MAIL_API_KEY: "Gmail sending",
  SUPABASE_SERVICE_ROLE_KEY: "Server-side DB writes",
  SUPABASE_URL: "Edge function base URL",
  RETELL_API_KEY: "Retell AI calling",
  RETELL_AGENT_ID: "Retell agent",
  RETELL_FROM_NUMBER: "Retell outbound number",
  TWILIO_ACCOUNT_SID: "Twilio SMS",
  TWILIO_AUTH_TOKEN: "Twilio SMS auth",
  TWILIO_PHONE_NUMBER: "Twilio sender",
  GOOGLE_PLACES_API_KEY: "Places API",
};

export default function HealthCheckPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ leads: number; logs: number; settings: number } | null>(null);

  const expectedProjectRef = (import.meta.env.VITE_SUPABASE_URL || "").match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || "unknown";

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("diag-env");
      if (fnErr) throw fnErr;
      setData(res as HealthData);

      const [leadsRes, logsRes, settingsRes] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("message_logs").select("id", { count: "exact", head: true }),
        supabase.from("settings").select("key", { count: "exact", head: true }),
      ]);
      setCounts({
        leads: leadsRes.count ?? 0,
        logs: logsRes.count ?? 0,
        settings: settingsRes.count ?? 0,
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, []);

  const projectMatch = data && data.project_ref === expectedProjectRef;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Production Health Check</h1>
        <Button onClick={run} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Re-check
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {data?.ok && projectMatch
              ? <><CheckCircle2 className="h-5 w-5 text-green-600" /> All systems ready</>
              : loading
                ? <><Loader2 className="h-5 w-5 animate-spin" /> Checking…</>
                : <><XCircle className="h-5 w-5 text-red-600" /> Issues detected</>}
          </CardTitle>
          <CardDescription>
            Last checked: {data?.checked_at ? new Date(data.checked_at).toLocaleString() : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {error && <div className="text-red-600">Failed: {error}</div>}

          <div className="space-y-1">
            <div className="font-medium">Supabase project</div>
            <div className="text-muted-foreground">
              Frontend: <code>{expectedProjectRef}</code>
            </div>
            <div className="text-muted-foreground">
              Edge functions: <code>{data?.project_ref ?? "…"}</code>{" "}
              {data && (
                projectMatch
                  ? <Badge variant="secondary" className="ml-1 bg-green-100 text-green-800">match</Badge>
                  : <Badge variant="destructive" className="ml-1">mismatch</Badge>
              )}
            </div>
          </div>

          {counts && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Stat label="Leads" value={counts.leads} />
              <Stat label="Message logs" value={counts.logs} />
              <Stat label="Settings" value={counts.settings} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Secrets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data ? Object.entries(data.secrets).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
              <div>
                <code className="text-xs">{k}</code>
                <div className="text-xs text-muted-foreground">{REQUIRED_SECRETS_LABELS[k] || ""}</div>
              </div>
              {v.present
                ? <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />present</Badge>
                : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />missing</Badge>}
            </div>
          )) : <div className="text-sm text-muted-foreground">Loading…</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
