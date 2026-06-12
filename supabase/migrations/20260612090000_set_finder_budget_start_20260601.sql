insert into public.settings (key, value)
values ('finder_budget_start_date', '2026-06-01')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
