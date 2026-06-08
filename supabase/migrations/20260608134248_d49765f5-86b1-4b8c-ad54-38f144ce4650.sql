ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS call_status text,
  ADD COLUMN IF NOT EXISTS retell_call_id text,
  ADD COLUMN IF NOT EXISTS retell_agent_id text,
  ADD COLUMN IF NOT EXISTS last_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_state text DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS outreach_history jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outreach_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS business_name text;

CREATE INDEX IF NOT EXISTS idx_leads_call_status ON public.leads(call_status);
CREATE INDEX IF NOT EXISTS idx_leads_retell_call_id ON public.leads(retell_call_id);
CREATE INDEX IF NOT EXISTS idx_leads_outreach_state ON public.leads(outreach_state);