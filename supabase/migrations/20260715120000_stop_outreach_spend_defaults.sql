insert into settings (key, value)
values
  ('ai_calls_enabled', 'false'),
  ('ai_calls_daily', '0'),
  ('ai_calls_daily_connected_cap', '0'),
  ('ai_calls_daily_attempt_cap', '0'),
  ('gmail_autosend_enabled', 'false'),
  ('gmail_autosend_force', 'false'),
  ('gmail_autosend_daily', '0'),
  ('gmail_daily_cap', '0'),
  ('gmail_autosend_daily_se', '0'),
  ('gmail_autosend_daily_uk', '0'),
  ('gmail_autosend_daily_es', '0'),
  ('gmail_autosend_batch_size', '0'),
  ('partner_gmail_auto_enabled', 'false'),
  ('partner_gmail_daily_cap', '0'),
  ('partner_gmail_batch_size', '0')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
