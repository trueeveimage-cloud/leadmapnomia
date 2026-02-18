
-- LeadMap CRM Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id TEXT,
  maps_url TEXT,
  name TEXT NOT NULL,
  category TEXT,
  niche_label TEXT,
  rating NUMERIC(3,1),
  reviews_count INTEGER DEFAULT 0,
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  section TEXT NOT NULL DEFAULT 'unsorted' CHECK (section IN ('unsorted','phone','gmail','email','missing','both')),
  status TEXT NOT NULL DEFAULT 'not_contacted' CHECK (status IN ('not_contacted','contacted','answered','callback','interested','not_interested','unsure','closed_won','closed_lost')),
  call_outcome_last TEXT,
  next_action_at TIMESTAMPTZ,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity log
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings table (single row store)
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_leads_section ON public.leads(section);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_place_id ON public.leads(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX idx_leads_next_action_at ON public.leads(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX idx_leads_name ON public.leads USING gin(to_tsvector('english', name));
CREATE INDEX idx_activities_lead_id ON public.activities(lead_id);

-- Unique constraint on place_id for deduplication
CREATE UNIQUE INDEX idx_leads_place_id_unique ON public.leads(place_id) WHERE place_id IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies - this is a single-user app (no auth needed), so allow all operations
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Open policies for single-user CRM (no auth)
CREATE POLICY "Allow all on leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Seed default settings
INSERT INTO public.settings (key, value) VALUES
  ('gmail_triage_rule', 'gmail'),
  ('both_primary_section', 'both');
