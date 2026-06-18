create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

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
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_cron_secret')
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
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_cron_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'trigger', 'morning_partner_supply_check', 'targetReady', 140)
  ) as request_id;
  $$
);
