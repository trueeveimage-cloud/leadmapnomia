-- 1. Campaigns extension
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'nomia',
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS email_subject text;

CREATE INDEX IF NOT EXISTS idx_campaigns_product ON public.campaigns(product);

-- 2. Campaign recipients
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  product text NOT NULL DEFAULT 'nomia',
  channel text NOT NULL DEFAULT 'email',
  to_email text,
  to_phone text,
  rendered_subject text,
  rendered_body text,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligible boolean NOT NULL DEFAULT true,
  block_reason text,
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  send_status text NOT NULL DEFAULT 'not_sent',
  send_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage campaign_recipients"
  ON public.campaign_recipients FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_lead ON public.campaign_recipients(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_state ON public.campaign_recipients(product, review_state, send_status);

DROP TRIGGER IF EXISTS update_campaign_recipients_updated_at ON public.campaign_recipients;
CREATE TRIGGER update_campaign_recipients_updated_at
  BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Notifications scoping
ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'nomia',
  ADD COLUMN IF NOT EXISTS lead_id uuid;

CREATE INDEX IF NOT EXISTS idx_app_notifications_product_unread
  ON public.app_notifications(product, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notifications_lead ON public.app_notifications(lead_id);

-- 4. Identity normalization helper
CREATE OR REPLACE FUNCTION public.normalize_business_identity(p_name text, p_city text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(
    regexp_replace(lower(coalesce(p_name,'') || '|' || coalesce(p_city,'')), '[^a-z0-9|]', '', 'g'),
    '|'
  )
$$;

-- 5. Single outreach lock authority (cross-channel identity aware)
CREATE OR REPLACE FUNCTION public.acquire_outreach_lock(p_lead_id uuid, p_method text, p_manual_unlock boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_email text;
  v_phone text;
  v_domain text;
  v_identity text;
  v_conflict record;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'lead_not_found');
  END IF;

  -- Do Not Contact always blocks, even with a manual unlock
  IF COALESCE(v_lead.do_not_contact, false)
     OR COALESCE(v_lead.outreach_opt_out, false)
     OR v_lead.outreach_state = 'do_not_contact' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'do_not_contact');
  END IF;

  v_email    := nullif(lower(trim(coalesce(v_lead.email, ''))), '');
  v_phone    := nullif(regexp_replace(coalesce(v_lead.phone_e164, v_lead.phone, ''), '[^0-9+]', '', 'g'), '');
  v_domain   := nullif(lower(regexp_replace(regexp_replace(coalesce(v_lead.website,''), '^https?://(www\.)?', ''), '/.*$', '')), '');
  v_identity := public.normalize_business_identity(coalesce(v_lead.business_name, v_lead.name), v_lead.city);

  IF p_manual_unlock THEN
    RETURN jsonb_build_object('allowed', true, 'manual_unlock', true);
  END IF;

  -- Same-channel history on this lead
  IF p_method = 'email' AND (v_lead.outreach_state = 'email_sent' OR EXISTS (
      SELECT 1 FROM public.message_logs
      WHERE lead_id = p_lead_id AND channel = 'email' AND direction = 'outbound'
        AND status IN ('sent','queued'))) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_emailed');
  ELSIF p_method = 'sms' AND v_lead.outreach_state = 'sms_sent' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_sms');
  ELSIF p_method IN ('call','ai_call') AND v_lead.outreach_state = 'called' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_called');
  END IF;

  -- Cross-channel / cross-record identity block
  SELECT l.id, l.name, l.outreach_state,
         CASE
           WHEN v_email IS NOT NULL AND lower(trim(coalesce(l.email,''))) = v_email THEN 'email'
           WHEN v_phone IS NOT NULL AND nullif(regexp_replace(coalesce(l.phone_e164, l.phone, ''), '[^0-9+]', '', 'g'),'') = v_phone THEN 'phone'
           WHEN v_domain IS NOT NULL AND nullif(lower(regexp_replace(regexp_replace(coalesce(l.website,''), '^https?://(www\.)?', ''), '/.*$', '')),'') = v_domain THEN 'domain'
           WHEN v_lead.place_id IS NOT NULL AND l.place_id = v_lead.place_id THEN 'place'
           ELSE 'business'
         END AS identity_kind
    INTO v_conflict
  FROM public.leads l
  WHERE l.id <> p_lead_id
    AND coalesce(l.outreach_state, 'not_contacted') NOT IN ('not_contacted')
    AND (
      (v_email  IS NOT NULL AND lower(trim(coalesce(l.email,''))) = v_email)
      OR (v_phone IS NOT NULL AND nullif(regexp_replace(coalesce(l.phone_e164, l.phone, ''), '[^0-9+]', '', 'g'),'') = v_phone)
      OR (v_domain IS NOT NULL AND nullif(lower(regexp_replace(regexp_replace(coalesce(l.website,''), '^https?://(www\.)?', ''), '/.*$', '')),'') = v_domain)
      OR (v_lead.place_id IS NOT NULL AND l.place_id = v_lead.place_id)
      OR (v_identity IS NOT NULL AND public.normalize_business_identity(coalesce(l.business_name, l.name), l.city) = v_identity)
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate_identity',
      'identity_kind', v_conflict.identity_kind,
      'conflict_lead_id', v_conflict.id,
      'conflict_lead_name', v_conflict.name
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'manual_unlock', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.acquire_outreach_lock(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_outreach_lock(uuid, text, boolean) TO service_role;

-- 6. Owner-only audited unlock
CREATE OR REPLACE FUNCTION public.unlock_outreach_identity(p_lead_id uuid, p_method text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_method NOT IN ('email','sms','call','ai_call') THEN
    RAISE EXCEPTION 'invalid_method';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN
    RAISE EXCEPTION 'reason_too_short';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;
  IF COALESCE(v_lead.do_not_contact, false) OR COALESCE(v_lead.outreach_opt_out, false) THEN
    RAISE EXCEPTION 'do_not_contact_cannot_be_unlocked';
  END IF;

  -- Preserve the original lock, add an explicit channel unlock record
  INSERT INTO public.outreach_locks (lead_id, lock_type, lock_value, method, manually_unlocked)
  VALUES (p_lead_id, 'manual_unlock', coalesce(v_lead.email, v_lead.phone, v_lead.id::text), p_method, true);

  INSERT INTO public.activities (lead_id, type, payload)
  VALUES (p_lead_id, 'outreach_unlock', jsonb_build_object(
    'method', p_method,
    'reason', btrim(p_reason),
    'unlocked_by', v_uid,
    'unlocked_at', now()
  ));

  RETURN jsonb_build_object('unlocked', true, 'method', p_method);
END;
$function$;

REVOKE ALL ON FUNCTION public.unlock_outreach_identity(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_outreach_identity(uuid, text, text) TO authenticated, service_role;

-- 7. No anonymous CRM access
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.normalize_business_identity(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_business_identity(text, text) TO authenticated, service_role;