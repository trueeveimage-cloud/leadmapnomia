
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS no_answer_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_call_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_call_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_next_call_after ON public.leads(next_call_after) WHERE next_call_after IS NOT NULL;

INSERT INTO public.settings (key, value) VALUES
  ('email_scrape_cost_per_lookup', '0'),
  ('gmail_autosend_daily', '100'),
  ('ai_calls_per_run', '5'),
  ('ai_calls_daily_cap', '15')
ON CONFLICT (key) DO NOTHING;
