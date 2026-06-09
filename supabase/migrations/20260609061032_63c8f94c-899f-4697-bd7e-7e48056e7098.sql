
CREATE OR REPLACE FUNCTION public.acquire_outreach_lock(
  p_lead_id uuid,
  p_method text,
  p_manual_unlock boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_prior int;
  v_reason text;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'lead_not_found');
  END IF;

  IF COALESCE(v_lead.do_not_contact, false) OR COALESCE(v_lead.outreach_opt_out, false) OR v_lead.outreach_state = 'do_not_contact' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'do_not_contact');
  END IF;

  IF NOT p_manual_unlock THEN
    IF p_method = 'email' THEN
      IF v_lead.outreach_state = 'email_sent' THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'already_emailed');
      END IF;
      SELECT count(*) INTO v_prior FROM public.message_logs
        WHERE lead_id = p_lead_id AND channel = 'email' AND direction = 'outbound' AND status IN ('sent','queued');
      IF v_prior > 0 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'already_emailed');
      END IF;
    ELSIF p_method = 'sms' THEN
      IF v_lead.outreach_state = 'sms_sent' THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'already_sms');
      END IF;
    ELSIF p_method = 'ai_call' OR p_method = 'call' THEN
      IF v_lead.outreach_state = 'called' THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'already_called');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'manual_unlock', p_manual_unlock);
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_outreach_lock(uuid, text, boolean) TO authenticated, service_role;
