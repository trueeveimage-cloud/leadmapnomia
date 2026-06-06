insert into public.settings (key, value)
values
  ('ai_calls_enabled', 'false'),
  ('ai_calls_daily', '15'),
  ('ai_calls_per_run', '3'),
  ('ai_calls_start_hour', '9'),
  ('ai_calls_end_hour', '17'),
  ('ai_calls_days', '1,2,3,4,5'),
  ('ai_calls_countries', 'SE'),
  ('ai_calls_min_score', '0'),
  ('ai_calls_product', 'leadmap'),
  ('ai_calls_timezone', 'Europe/Stockholm'),
  ('gmail_autosend_enabled', 'false'),
  ('gmail_autosend_daily', '100'),
  ('gmail_daily_cap', '100')
on conflict (key) do nothing;
