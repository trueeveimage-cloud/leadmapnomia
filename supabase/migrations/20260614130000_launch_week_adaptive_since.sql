insert into public.settings (key, value) values
  ('outreach_niche_adaptive_since', '2026-06-15T00:00:00+02:00')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
