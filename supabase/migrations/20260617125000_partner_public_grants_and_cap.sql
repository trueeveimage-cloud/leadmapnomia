-- Keep the public/no-login CRM mode working for the newer partner pipeline tables.
-- The table-level policies exist in the partner pipeline migration, but explicit grants
-- make production behave the same way as the rest of the public CRM tables.

grant select, insert, update, delete on table
  public.partner_prospects,
  public.partner_outreach_logs
to anon, authenticated;

drop policy if exists "Anon CRM access" on public.partner_prospects;
create policy "Anon CRM access"
  on public.partner_prospects for all
  to anon
  using (true)
  with check (true);

drop policy if exists "Anon CRM access" on public.partner_outreach_logs;
create policy "Anon CRM access"
  on public.partner_outreach_logs for all
  to anon
  using (true)
  with check (true);

insert into public.settings (key, value)
values
  ('partner_gmail_daily_cap', '100'),
  ('partner_gmail_delay_seconds', '20')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
