CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_notifications TO authenticated;
GRANT ALL ON public.app_notifications TO service_role;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read notifications"
  ON public.app_notifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert notifications"
  ON public.app_notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update notifications"
  ON public.app_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete notifications"
  ON public.app_notifications FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS app_notifications_created_idx ON public.app_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS app_notifications_unread_idx ON public.app_notifications (read_at) WHERE read_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;