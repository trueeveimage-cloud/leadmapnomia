-- Phase 1: Product split (Nomia / Leadmap)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'nomia';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'nomia';
ALTER TABLE public.message_logs ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'nomia';

CREATE INDEX IF NOT EXISTS idx_leads_product ON public.leads(product);
CREATE INDEX IF NOT EXISTS idx_campaigns_product ON public.campaigns(product);
CREATE INDEX IF NOT EXISTS idx_message_logs_product ON public.message_logs(product);

-- Backfill existing rows (defensive, in case any nulls slipped through)
UPDATE public.leads SET product = 'nomia' WHERE product IS NULL;
UPDATE public.campaigns SET product = 'nomia' WHERE product IS NULL;
UPDATE public.message_logs SET product = 'nomia' WHERE product IS NULL;