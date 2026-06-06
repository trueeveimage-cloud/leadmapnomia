create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'leadmap-ai-calls-hourly',
  'leadmap-gmail-daily'
);

select cron.schedule(
  'leadmap-ai-calls-hourly',
  '0 7-16 * * 1-5',
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
  'leadmap-gmail-daily',
  '0 8 * * 1-5',
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
