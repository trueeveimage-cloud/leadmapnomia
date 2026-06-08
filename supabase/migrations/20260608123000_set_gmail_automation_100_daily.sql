insert into public.settings (key, value)
values
  ('gmail_autosend_enabled', 'true'),
  ('gmail_autosend_daily', '100'),
  ('gmail_daily_cap', '100'),
  ('gmail_autosend_batch_size', '10'),
  ('gmail_autosend_delay_seconds', '120')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
