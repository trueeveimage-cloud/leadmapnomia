
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS potential_score integer,
  ADD COLUMN IF NOT EXISTS lead_tier text,
  ADD COLUMN IF NOT EXISTS estimated_value text,
  ADD COLUMN IF NOT EXISTS website_quality text,
  ADD COLUMN IF NOT EXISTS has_booking boolean,
  ADD COLUMN IF NOT EXISTS has_emergency boolean,
  ADD COLUMN IF NOT EXISTS has_receptionist boolean,
  ADD COLUMN IF NOT EXISTS has_contact_form boolean,
  ADD COLUMN IF NOT EXISTS best_contact_method text,
  ADD COLUMN IF NOT EXISTS why_good_lead text,
  ADD COLUMN IF NOT EXISTS email_source text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS opening_hours text,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS detected_niche text;

CREATE INDEX IF NOT EXISTS idx_leads_potential_score ON public.leads (potential_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_lead_tier ON public.leads (lead_tier);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_at ON public.leads (follow_up_at);
