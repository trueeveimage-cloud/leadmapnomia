insert into public.settings (key, value)
values
  ('gmail_autosend_enabled', 'true'),
  ('gmail_autosend_daily', '100'),
  ('gmail_daily_cap', '100'),
  ('gmail_autosend_batch_size', '10'),
  ('gmail_autosend_delay_seconds', '120'),
  ('ai_calls_enabled', 'true'),
  ('ai_calls_daily', '15'),
  ('ai_calls_daily_connected_cap', '15'),
  ('ai_calls_per_run', '1'),
  ('ai_calls_days', '1,2,3,4,5'),
  ('ai_calls_timezone', 'Europe/Stockholm'),
  ('finder_budget_start_date', '2026-06-01'),
  ('finder_spend_cap_usd', '280')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
