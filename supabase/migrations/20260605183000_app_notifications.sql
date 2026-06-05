CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at
  ON public.app_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_notifications_unread
  ON public.app_notifications(created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access on app_notifications" ON public.app_notifications;
CREATE POLICY "Authenticated access on app_notifications"
  ON public.app_notifications
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
