CREATE OR REPLACE FUNCTION public.create_app_notification(
  p_type text,
  p_title text,
  p_message text DEFAULT '',
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.app_notifications(type, title, message, payload)
  VALUES (p_type, p_title, COALESCE(p_message, ''), COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_inbound_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_title text;
  v_message text;
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT id, name, email, phone
  INTO v_lead
  FROM public.leads
  WHERE id = NEW.lead_id;

  v_title := CASE
    WHEN NEW.channel = 'email' THEN 'New email reply'
    WHEN NEW.channel = 'sms' THEN 'New SMS reply'
    ELSE 'New inbound reply'
  END;

  v_message := COALESCE(v_lead.name, 'A lead') || ': ' || LEFT(COALESCE(NEW.body, ''), 180);

  INSERT INTO public.app_notifications(type, title, message, payload)
  VALUES (
    'inbound_reply',
    v_title,
    v_message,
    jsonb_build_object(
      'leadId', NEW.lead_id,
      'leadName', COALESCE(v_lead.name, ''),
      'channel', NEW.channel,
      'from', COALESCE(NEW.from_number, ''),
      'messageId', NEW.id,
      'providerMessageId', COALESCE(NEW.provider_message_sid, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_inbound_message ON public.message_logs;
CREATE TRIGGER trg_notify_inbound_message
  AFTER INSERT ON public.message_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inbound_message();
