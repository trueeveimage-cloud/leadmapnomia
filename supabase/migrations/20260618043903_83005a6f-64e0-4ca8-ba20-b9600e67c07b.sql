CREATE TABLE IF NOT EXISTS public.partner_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  email text,
  phone text,
  country text,
  city text,
  address text,
  partner_type text NOT NULL DEFAULT 'consultant',
  status text NOT NULL DEFAULT 'new',
  fit_score integer NOT NULL DEFAULT 0,
  fit_reason text,
  source_url text,
  source text NOT NULL DEFAULT 'partner_finder',
  notes text,
  do_not_contact boolean NOT NULL DEFAULT false,
  last_contacted_at timestamptz,
  last_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_prospects_status_check CHECK (status IN ('new','researching','ready_to_contact','contacted','replied','partner_call_booked','qualified','not_fit','do_not_contact')),
  CONSTRAINT partner_prospects_type_check CHECK (partner_type IN ('telecom','pbx_voip','agency_marketer','installer','consultant'))
);

CREATE TABLE IF NOT EXISTS public.partner_outreach_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_prospect_id uuid REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  direction text NOT NULL DEFAULT 'outbound',
  status text NOT NULL DEFAULT 'sent',
  subject text,
  body text,
  to_email text,
  provider text,
  provider_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_prospects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_prospects TO anon;
GRANT ALL ON public.partner_prospects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_outreach_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_outreach_logs TO anon;
GRANT ALL ON public.partner_outreach_logs TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS partner_prospects_email_unique
  ON public.partner_prospects(lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS partner_prospects_website_unique
  ON public.partner_prospects(lower(website))
  WHERE website IS NOT NULL AND website <> '';

CREATE INDEX IF NOT EXISTS partner_prospects_status_idx ON public.partner_prospects(status);
CREATE INDEX IF NOT EXISTS partner_prospects_type_idx ON public.partner_prospects(partner_type);
CREATE INDEX IF NOT EXISTS partner_outreach_logs_prospect_idx ON public.partner_outreach_logs(partner_prospect_id);

ALTER TABLE public.partner_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_outreach_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner prospects CRM access" ON public.partner_prospects;
CREATE POLICY "Partner prospects CRM access"
  ON public.partner_prospects FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Partner logs CRM access" ON public.partner_outreach_logs;
CREATE POLICY "Partner logs CRM access"
  ON public.partner_outreach_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_partner_prospects_updated_at ON public.partner_prospects;
CREATE TRIGGER update_partner_prospects_updated_at
  BEFORE UPDATE ON public.partner_prospects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();