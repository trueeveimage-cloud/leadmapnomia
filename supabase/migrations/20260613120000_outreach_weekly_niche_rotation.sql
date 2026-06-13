insert into public.settings (key, value) values
  ('outreach_niche_rotation_enabled', 'true'),
  ('outreach_niche_adaptive_enabled', 'true'),
  ('outreach_niche_adaptive_min_contacts', '20'),
  ('outreach_niche_rotation_plan', '{"1":"emergency_trades","2":"dental","3":"electricians","4":"auto_services","5":"cleaning"}'),
  ('outreach_niche_priority', 'emergency_trades,dental,electricians,auto_services,cleaning')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
