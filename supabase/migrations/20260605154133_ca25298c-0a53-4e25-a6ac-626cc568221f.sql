DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='outreach_locks' AND relnamespace='public'::regnamespace) THEN
    CREATE TABLE public.outreach_locks (
      id uuid primary key default gen_random_uuid(),
      lead_id uuid not null,
      lock_type text not null,
      lock_value text not null,
      method text not null,
      manually_unlocked boolean not null default false,
      created_at timestamptz not null default now()
    );
    CREATE UNIQUE INDEX outreach_locks_unique_identity ON public.outreach_locks(lock_type, lock_value);
  END IF;
END $$;

REVOKE ALL ON public.outreach_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outreach_locks TO service_role;
ALTER TABLE public.outreach_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON public.outreach_locks;
CREATE POLICY "Service role only" ON public.outreach_locks FOR ALL USING (false) WITH CHECK (false);