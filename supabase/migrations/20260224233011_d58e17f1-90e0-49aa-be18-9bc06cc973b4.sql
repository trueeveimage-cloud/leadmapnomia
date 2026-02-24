
-- Add batch_id to group multi-city runs together
ALTER TABLE public.finder_runs ADD COLUMN batch_id uuid DEFAULT NULL;
ALTER TABLE public.finder_runs ADD COLUMN batch_label text DEFAULT NULL;

-- Index for fast batch lookups
CREATE INDEX idx_finder_runs_batch_id ON public.finder_runs(batch_id) WHERE batch_id IS NOT NULL;
