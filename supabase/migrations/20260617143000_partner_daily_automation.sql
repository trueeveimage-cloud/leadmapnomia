create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

insert into public.settings (key, value)
values
  ('partner_gmail_auto_enabled', 'true'),
  ('partner_gmail_daily_cap', '100'),
  ('partner_gmail_batch_size', '10'),
  ('partner_gmail_supply_min', '140'),
  ('partner_gmail_start_hour', '8'),
  ('partner_gmail_start_minute', '0'),
  ('partner_gmail_end_hour', '18'),
  ('partner_gmail_end_minute', '0'),
  ('partner_gmail_days', '1,2,3,4,5'),
  ('partner_gmail_timezone', 'Europe/Stockholm')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'leadmap-partner-gmail-every-20',
  'leadmap-partner-replenish-morning'
);

select cron.schedule(
  'leadmap-partner-gmail-every-20',
  '*/20 8-17 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_project_url') || '/functions/v1/auto-send-partner-gmail-daily',
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
  'leadmap-partner-replenish-morning',
  '15 7 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_project_url') || '/functions/v1/auto-partner-finder-replenish',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_publishable_key')
    ),
    body := jsonb_build_object('scheduled', true, 'trigger', 'morning_partner_supply_check', 'targetReady', 140)
  ) as request_id;
  $$
);
