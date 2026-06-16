import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export type MarketingIntent = "audit" | "demo";

export interface MarketingAttribution {
  source_page: string;
  page_type: string;
  cta_variant: string;
  niche?: string;
  city?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
}

export interface MarketingLeadInput {
  intent: MarketingIntent;
  companyName: string;
  industry: string;
  city: string;
  phoneOrEmail: string;
  email?: string;
  website?: string;
  missedCalls?: string;
  preferredContact?: string;
  attribution: MarketingAttribution;
}

export function getMarketingAttribution(overrides: Partial<MarketingAttribution> = {}): MarketingAttribution {
  if (typeof window === "undefined") {
    return {
      source_page: overrides.source_page || "server",
      page_type: overrides.page_type || "unknown",
      cta_variant: overrides.cta_variant || "unknown",
      ...overrides,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    source_page: overrides.source_page || window.location.pathname,
    page_type: overrides.page_type || "homepage",
    cta_variant: overrides.cta_variant || "primary",
    niche: overrides.niche,
    city: overrides.city,
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    referrer: document.referrer || undefined,
    ...overrides,
  };
}

function splitContact(value: string, email?: string) {
  const cleanValue = value.trim();
  const emailValue = (email || "").trim();
  const looksLikeEmail = cleanValue.includes("@");

  return {
    phone: looksLikeEmail ? null : cleanValue || null,
    email: emailValue || (looksLikeEmail ? cleanValue : null),
  };
}

export async function submitMarketingLead(input: MarketingLeadInput) {
  const contact = splitContact(input.phoneOrEmail, input.email);
  const tags = [
    input.intent === "audit" ? "website_audit" : "demo_request",
    input.attribution.page_type,
    input.attribution.cta_variant,
    input.industry,
  ].filter(Boolean);

  const notes = JSON.stringify(
    {
      type: input.intent === "audit" ? "free_missed_call_audit" : "demo_booking",
      website: input.website || null,
      missed_calls_per_week: input.missedCalls || null,
      preferred_contact: input.preferredContact || null,
      attribution: input.attribution,
    },
    null,
    2,
  );

  const payload: TablesInsert<"leads"> = {
    name: input.companyName.trim(),
    business_name: input.companyName.trim(),
    category: input.industry,
    niche_label: input.industry,
    detected_niche: input.attribution.niche || input.industry,
    city: input.city,
    country: "SE",
    phone: contact.phone,
    email: contact.email,
    website: input.website || null,
    section: contact.phone && contact.email ? "both" : contact.email ? "email" : contact.phone ? "phone" : "missing",
    status: "interested",
    product: "leadmap",
    tags,
    notes,
    outreach_stage: "website_inbound",
    needs_call: Boolean(contact.phone),
    last_message_preview: input.intent === "audit" ? "Gratis missade-samtal audit" : "Boka demo",
  };

  const { data, error } = await supabase.from("leads").insert(payload).select().single();
  if (error) throw error;
  return data;
}
