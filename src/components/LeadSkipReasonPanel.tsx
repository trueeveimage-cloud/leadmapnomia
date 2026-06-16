import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2, Mail, MessageSquare, Phone, Ban, Copy } from "lucide-react";

type Method = "email" | "sms" | "call" | "ai_call";

interface Props {
  lead: Lead;
  method?: Method;
  className?: string;
}

interface SkipReason {
  blocked: boolean;
  code: string;
  label: string;
  detail?: string;
  icon: React.ReactNode;
}

/**
 * Lightweight panel explaining why a lead would be skipped from outreach.
 * Checks: opt-out, missing contact info, prior message_logs (per-lead + dedupe by email/phone), placeId duplicates.
 */
export default function LeadSkipReasonPanel({ lead, method = "email", className }: Props) {
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<SkipReason[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: SkipReason[] = [];

      // 1. Opt-out / DNC
      if ((lead as any).outreach_opt_out || (lead as any).do_not_contact || (lead as any).outreach_state === "do_not_contact") {
        out.push({
          blocked: true,
          code: "opt_out",
          label: "Opted out / Do not contact",
          icon: <Ban className="h-4 w-4" />,
        });
      }

      // 2. Missing contact field for chosen method
      if (method === "email" && !lead.email) {
        out.push({ blocked: true, code: "no_email", label: "No email address", icon: <Mail className="h-4 w-4" /> });
      }
      if ((method === "sms" || method === "call" || method === "ai_call") && !lead.phone) {
        out.push({ blocked: true, code: "no_phone", label: "No phone number", icon: <Phone className="h-4 w-4" /> });
      }

      // 3. Prior outbound to this lead via the chosen channel
      const channel = method === "email" ? "email" : method === "sms" ? "sms" : "call";
      const { data: priorOwn } = await supabase
        .from("message_logs")
        .select("id, channel, status, created_at")
        .eq("lead_id", lead.id)
        .eq("direction", "outbound")
        .eq("channel", channel)
        .in("status", ["sent", "queued", "delivered"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (priorOwn && priorOwn.length > 0) {
        out.push({
          blocked: true,
          code: "already_contacted",
          label: `Already ${channel === "email" ? "emailed" : channel === "sms" ? "SMSed" : "called"}`,
          detail: `Last sent ${new Date(priorOwn[0].created_at).toLocaleString()}`,
          icon: channel === "email" ? <Mail className="h-4 w-4" /> : channel === "sms" ? <MessageSquare className="h-4 w-4" /> : <Phone className="h-4 w-4" />,
        });
      }

      // 4. Global dedupe — same email/phone used on another lead
      if (method === "email" && lead.email) {
        const { data: dupEmail } = await supabase
          .from("message_logs")
          .select("id, lead_id, created_at")
          .eq("channel", "email")
          .eq("direction", "outbound")
          .eq("to_number", lead.email.toLowerCase())
          .neq("lead_id", lead.id)
          .in("status", ["sent", "queued", "delivered"])
          .limit(1);
        if (dupEmail && dupEmail.length > 0) {
          out.push({
            blocked: true,
            code: "duplicate_email",
            label: "This email was already used on another lead",
            detail: `Sent ${new Date(dupEmail[0].created_at).toLocaleString()}`,
            icon: <Copy className="h-4 w-4" />,
          });
        }
      }
      if ((method === "sms" || method === "call" || method === "ai_call") && lead.phone) {
        const { data: dupPhone } = await supabase
          .from("message_logs")
          .select("id, lead_id, created_at")
          .eq("channel", channel)
          .eq("direction", "outbound")
          .eq("to_number", lead.phone)
          .neq("lead_id", lead.id)
          .in("status", ["sent", "queued", "delivered"])
          .limit(1);
        if (dupPhone && dupPhone.length > 0) {
          out.push({
            blocked: true,
            code: "duplicate_phone",
            label: "This phone was already used on another lead",
            detail: `Sent ${new Date(dupPhone[0].created_at).toLocaleString()}`,
            icon: <Copy className="h-4 w-4" />,
          });
        }
      }

      // 5. PlaceId duplicate
      const placeId = (lead as any).place_id;
      if (placeId) {
        const { data: dupPlace } = await supabase
          .from("leads")
          .select("id, name")
          .eq("place_id", placeId)
          .neq("id", lead.id)
          .limit(1);
        if (dupPlace && dupPlace.length > 0) {
          out.push({
            blocked: true,
            code: "duplicate_place_id",
            label: "Another lead exists for this Google Place",
            detail: dupPlace[0].name || undefined,
            icon: <Copy className="h-4 w-4" />,
          });
        }
      }

      if (!cancelled) {
        setReasons(out);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lead.id, method]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground p-3 border rounded-md ${className || ""}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking eligibility…
      </div>
    );
  }

  if (reasons.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-xs p-3 border rounded-md border-green-200 bg-green-50 text-green-800 ${className || ""}`}>
        <CheckCircle2 className="h-4 w-4" /> Eligible for {method.replace("_", " ")}
      </div>
    );
  }

  return (
    <div className={`p-3 border rounded-md border-amber-200 bg-amber-50 space-y-2 ${className || ""}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
        <AlertCircle className="h-4 w-4" />
        Would be skipped for {method.replace("_", " ")} ({reasons.length})
      </div>
      <ul className="space-y-1.5">
        {reasons.map((r) => (
          <li key={r.code} className="flex items-start gap-2 text-xs text-amber-900">
            <span className="mt-0.5 text-amber-700">{r.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.label}</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-amber-300">{r.code}</Badge>
              </div>
              {r.detail && <div className="text-amber-700 text-[11px]">{r.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
