insert into public.settings (key, value)
values ('finder_spend_cap_usd', '280')
on conflict (key) do update
set value = '280',
    updated_at = now();
