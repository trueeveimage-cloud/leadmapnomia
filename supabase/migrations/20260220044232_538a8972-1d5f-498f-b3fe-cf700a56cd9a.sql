
-- Finder runs table
CREATE TABLE public.finder_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city text NOT NULL,
  mode text NOT NULL DEFAULT 'niche',
  keywords text[] NOT NULL DEFAULT '{}',
  radius integer NOT NULL DEFAULT 1500,
  max_pages integer NOT NULL DEFAULT 2,
  max_candidates integer NOT NULL DEFAULT 300,
  max_details integer NOT NULL DEFAULT 100,
  min_rating numeric NULL,
  min_reviews integer NULL,
  require_phone boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  stats jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.finder_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on finder_runs" ON public.finder_runs FOR ALL USING (true) WITH CHECK (true);

-- Finder candidates table
CREATE TABLE public.finder_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.finder_runs(id) ON DELETE CASCADE,
  place_id text NOT NULL,
  name text NOT NULL,
  address text NULL,
  rating numeric NULL,
  reviews_count integer NULL DEFAULT 0,
  types text[] NULL DEFAULT '{}',
  has_phone boolean NULL,
  has_website boolean NULL,
  phone text NULL,
  website text NULL,
  maps_url text NULL,
  category text NULL,
  last_fetched_at timestamp with time zone NULL,
  outcome text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.finder_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on finder_candidates" ON public.finder_candidates FOR ALL USING (true) WITH CHECK (true);

-- Place cache table for 30-day caching
CREATE TABLE public.place_cache (
  place_id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  address text NULL,
  phone text NULL,
  website text NULL,
  rating numeric NULL,
  reviews_count integer NULL DEFAULT 0,
  types text[] NULL DEFAULT '{}',
  maps_url text NULL,
  category text NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.place_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on place_cache" ON public.place_cache FOR ALL USING (true) WITH CHECK (true);

-- Index for deduplication
CREATE INDEX idx_finder_candidates_place_id ON public.finder_candidates(place_id);
CREATE INDEX idx_finder_candidates_run_id ON public.finder_candidates(run_id);
CREATE INDEX idx_place_cache_fetched_at ON public.place_cache(fetched_at);
