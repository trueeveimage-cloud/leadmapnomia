create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

insert into public.settings (key, value) values
  ('ai_calls_daily', '15'),
  ('finder_spend_cap_usd', '280')
on conflict (key) do nothing;

select cron.unschedule(jobname)
from cron.job
where jobname in ('leadmap-ai-calls-every-5', 'leadmap-gmail-every-5');

select cron.schedule(
  'leadmap-ai-calls-every-5',
  '*/5 8-15 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_project_url') || '/functions/v1/auto-start-ai-calls-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_cron_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'catchUpUntil', '17:30')
  ) as request_id;
  $$
);

select cron.schedule(
  'leadmap-gmail-every-5',
  '*/5 8-15 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_project_url') || '/functions/v1/auto-send-gmail-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'leadmap_cron_secret')
    ),
    body := jsonb_build_object('scheduled', true, 'catchUpUntil', '17:30')
  ) as request_id;
  $$
);
