
-- Callers table for cold calling team
CREATE TABLE public.callers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  rate_per_call numeric NOT NULL DEFAULT 20,
  bonus_per_sale numeric NOT NULL DEFAULT 500,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.callers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access on callers" ON public.callers FOR ALL USING (true) WITH CHECK (true);

-- Track which caller handled which lead
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS caller_id uuid REFERENCES public.callers(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS caller_name text;

-- Caller stats view helper: track calls per caller per day
CREATE TABLE public.caller_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES public.callers(id) ON DELETE CASCADE,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  calls_made integer NOT NULL DEFAULT 0,
  demos_booked integer NOT NULL DEFAULT 0,
  leads_interested integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.caller_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access on caller_sessions" ON public.caller_sessions FOR ALL USING (true) WITH CHECK (true);

-- Insert default callers
INSERT INTO public.callers (name, phone) VALUES ('Eli', null), ('Me', '0763224478');
