CREATE OR REPLACE FUNCTION public.notify_message_log_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
BEGIN
  SELECT id, name, email, phone
  INTO v_lead
  FROM public.leads
  WHERE id = NEW.lead_id;

  IF NEW.direction = 'inbound' THEN
    INSERT INTO public.app_notifications(type, title, message, payload)
    VALUES (
      'inbound_reply',
      CASE
        WHEN NEW.channel = 'email' THEN 'New email reply'
        WHEN NEW.channel = 'sms' THEN 'New SMS reply'
        ELSE 'New inbound reply'
      END,
      COALESCE(v_lead.name, 'A lead') || ': ' || LEFT(COALESCE(NEW.body, ''), 180),
      jsonb_build_object(
        'leadId', NEW.lead_id,
        'leadName', COALESCE(v_lead.name, ''),
        'channel', NEW.channel,
        'from', COALESCE(NEW.from_number, ''),
        'messageId', NEW.id,
        'providerMessageId', COALESCE(NEW.provider_message_sid, '')
      )
    );
  ELSIF NEW.direction = 'outbound' AND NEW.status IN ('failed', 'skipped', 'undelivered') THEN
    INSERT INTO public.app_notifications(type, title, message, payload)
    VALUES (
      CASE WHEN NEW.status = 'failed' OR NEW.status = 'undelivered' THEN 'system_error' ELSE 'outreach_skipped' END,
      CASE
        WHEN NEW.status = 'failed' THEN 'Outbound message failed'
        WHEN NEW.status = 'undelivered' THEN 'Outbound message undelivered'
        ELSE 'Outbound message skipped'
      END,
      COALESCE(v_lead.name, 'A lead') || ' - ' || COALESCE(NEW.channel, 'message') || ' ' || COALESCE(NEW.status, 'event'),
      jsonb_build_object(
        'leadId', NEW.lead_id,
        'leadName', COALESCE(v_lead.name, ''),
        'channel', NEW.channel,
        'status', NEW.status,
        'error', COALESCE(NEW.error_message, ''),
        'messageId', NEW.id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_inbound_message ON public.message_logs;
DROP TRIGGER IF EXISTS trg_notify_message_log_event ON public.message_logs;
CREATE TRIGGER trg_notify_message_log_event
  AFTER INSERT ON public.message_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_message_log_event();

CREATE OR REPLACE FUNCTION public.notify_lead_useful_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.app_notifications(type, title, message, payload)
    VALUES (
      'lead_status_changed',
      'Lead status changed',
      COALESCE(NEW.name, 'Lead') || ': ' || COALESCE(OLD.status, 'none') || ' -> ' || COALESCE(NEW.status, 'none'),
      jsonb_build_object('leadId', NEW.id, 'leadName', COALESCE(NEW.name, ''), 'from', OLD.status, 'to', NEW.status)
    );
  END IF;

  IF COALESCE(OLD.do_not_contact, false) IS DISTINCT FROM COALESCE(NEW.do_not_contact, false)
     OR COALESCE(OLD.outreach_opt_out, false) IS DISTINCT FROM COALESCE(NEW.outreach_opt_out, false) THEN
    IF COALESCE(NEW.do_not_contact, false) OR COALESCE(NEW.outreach_opt_out, false) THEN
      INSERT INTO public.app_notifications(type, title, message, payload)
      VALUES (
        'lead_status_changed',
        'Lead blocked from outreach',
        COALESCE(NEW.name, 'Lead') || ' is now do-not-contact/opted out.',
        jsonb_build_object('leadId', NEW.id, 'leadName', COALESCE(NEW.name, ''))
      );
    END IF;
  END IF;

  IF OLD.follow_up_at IS DISTINCT FROM NEW.follow_up_at AND NEW.follow_up_at IS NOT NULL THEN
    INSERT INTO public.app_notifications(type, title, message, payload)
    VALUES (
      'follow_up_set',
      'Follow-up scheduled',
      COALESCE(NEW.name, 'Lead') || ' follow-up set for ' || NEW.follow_up_at::text,
      jsonb_build_object('leadId', NEW.id, 'leadName', COALESCE(NEW.name, ''), 'followUpAt', NEW.follow_up_at)
    );
  END IF;

  IF OLD.call_status IS DISTINCT FROM NEW.call_status AND NEW.call_status IS NOT NULL THEN
    INSERT INTO public.app_notifications(type, title, message, payload)
    VALUES (
      'ai_call_done',
      'AI call status updated',
      COALESCE(NEW.name, 'Lead') || ': ' || NEW.call_status,
      jsonb_build_object('leadId', NEW.id, 'leadName', COALESCE(NEW.name, ''), 'callStatus', NEW.call_status)
    );
  END IF;

  IF COALESCE(OLD.needs_call, false) IS DISTINCT FROM COALESCE(NEW.needs_call, false)
     AND COALESCE(NEW.needs_call, false) THEN
    INSERT INTO public.app_notifications(type, title, message, payload)
    VALUES (
      'follow_up_set',
      'Lead moved to call list',
      COALESCE(NEW.name, 'Lead') || ' now needs a call.',
      jsonb_build_object('leadId', NEW.id, 'leadName', COALESCE(NEW.name, ''), 'reason', COALESCE(NEW.outreach_stage, ''))
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lead_useful_change ON public.leads;
CREATE TRIGGER trg_notify_lead_useful_change
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.follow_up_at IS DISTINCT FROM NEW.follow_up_at
    OR OLD.call_status IS DISTINCT FROM NEW.call_status
    OR COALESCE(OLD.needs_call, false) IS DISTINCT FROM COALESCE(NEW.needs_call, false)
    OR COALESCE(OLD.do_not_contact, false) IS DISTINCT FROM COALESCE(NEW.do_not_contact, false)
    OR COALESCE(OLD.outreach_opt_out, false) IS DISTINCT FROM COALESCE(NEW.outreach_opt_out, false)
  )
  EXECUTE FUNCTION public.notify_lead_useful_change();
