
ALTER TABLE public.finder_candidates ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.place_cache ADD COLUMN IF NOT EXISTS email text;
