
-- =============================================
-- Phase 1: Outreach System Database Schema
-- =============================================

-- 1) New lead outreach fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS outreach_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_replied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS call_after_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_stage text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_direction text,
  ADD COLUMN IF NOT EXISTS last_message_status text DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_leads_outreach_stage ON public.leads(outreach_stage);
CREATE INDEX IF NOT EXISTS idx_leads_needs_call ON public.leads(needs_call) WHERE needs_call = true;
CREATE INDEX IF NOT EXISTS idx_leads_phone_e164 ON public.leads(phone_e164);

-- 2) Message Logs table
CREATE TABLE public.message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction text NOT NULL,  -- inbound / outbound
  channel text NOT NULL DEFAULT 'sms',
  from_number text,
  to_number text,
  body text,
  provider text NOT NULL DEFAULT 'mock',
  provider_message_sid text,
  status text NOT NULL DEFAULT 'queued',
  error_code text,
  error_message text,
  campaign_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage message_logs" ON public.message_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_message_logs_lead ON public.message_logs(lead_id);
CREATE INDEX idx_message_logs_sid ON public.message_logs(provider_message_sid);

-- 3) Campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}',
  template_text text NOT NULL DEFAULT '',
  variables_used jsonb DEFAULT '[]',
  daily_cap integer NOT NULL DEFAULT 100,
  batch_cap integer NOT NULL DEFAULT 200,
  cooldown_days integer NOT NULL DEFAULT 14,
  call_after_hours integer NOT NULL DEFAULT 48,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage campaigns" ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Campaign Runs table
CREATE TABLE public.campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{"attempted":0,"sent":0,"delivered":0,"failed":0,"replied":0,"skipped_duplicate":0,"skipped_cooldown":0,"skipped_no_phone":0,"skipped_opt_out":0}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage campaign_runs" ON public.campaign_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_campaign_runs_campaign ON public.campaign_runs(campaign_id);

-- 5) Profiles table for auth
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update existing table policies to require authentication
-- (keeping permissive for all authenticated users since this is single-user)
DROP POLICY IF EXISTS "Allow all on leads" ON public.leads;
CREATE POLICY "Authenticated access on leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on activities" ON public.activities;
CREATE POLICY "Authenticated access on activities" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on settings" ON public.settings;
CREATE POLICY "Authenticated access on settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on finder_runs" ON public.finder_runs;
CREATE POLICY "Authenticated access on finder_runs" ON public.finder_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on finder_candidates" ON public.finder_candidates;
CREATE POLICY "Authenticated access on finder_candidates" ON public.finder_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on place_cache" ON public.place_cache;
CREATE POLICY "Authenticated access on place_cache" ON public.place_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon access to place_cache for edge functions
CREATE POLICY "Anon access on place_cache" ON public.place_cache FOR ALL TO anon USING (true) WITH CHECK (true);
