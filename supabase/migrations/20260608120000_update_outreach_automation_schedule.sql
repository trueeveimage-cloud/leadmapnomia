create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

insert into public.settings (key, value)
values
  ('ai_calls_enabled', 'true'),
  ('ai_calls_daily', '15'),
  ('ai_calls_per_run', '3'),
  ('ai_calls_start_hour', '10'),
  ('ai_calls_end_hour', '16'),
  ('ai_calls_days', '1,2,3,4,5'),
  ('ai_calls_timezone', 'Europe/Stockholm'),
  ('gmail_autosend_enabled', 'true'),
  ('gmail_autosend_daily', '40'),
  ('gmail_daily_cap', '40'),
  ('gmail_autosend_delay_seconds', '120'),
  ('gmail_autosend_batch_size', '10')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'leadmap-ai-calls-hourly',
  'leadmap-gmail-daily',
  'leadmap-gmail-hourly'
);

select cron.schedule(
  'leadmap-ai-calls-hourly',
  '0 8-15 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_project_url') || '/functions/v1/auto-start-ai-calls-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_publishable_key')
    ),
    body := jsonb_build_object('scheduled', true)
  ) as request_id;
  $$
);

select cron.schedule(
  'leadmap-gmail-hourly',
  '0 8-15 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_project_url') || '/functions/v1/auto-send-gmail-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_publishable_key')
    ),
    body := jsonb_build_object('scheduled', true)
  ) as request_id;
  $$
);
