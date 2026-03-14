
-- Delete duplicate outbound messages, keeping only the first one per (campaign_run_id, lead_id)
DELETE FROM public.message_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY campaign_run_id, lead_id 
      ORDER BY created_at ASC
    ) as rn
    FROM public.message_logs
    WHERE direction = 'outbound' AND campaign_run_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Now create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_logs_unique_outbound 
ON public.message_logs (campaign_run_id, lead_id) 
WHERE direction = 'outbound' AND campaign_run_id IS NOT NULL;
