-- Public CRM mode: allow the frontend anon key to use CRM pages without a login.
-- This intentionally opens the operational CRM tables. Do not use this mode for a private CRM.

grant usage on schema public to anon;

grant select, insert, update, delete on table
  public.activities,
  public.app_notifications,
  public.caller_sessions,
  public.callers,
  public.campaign_runs,
  public.campaigns,
  public.finder_candidates,
  public.finder_runs,
  public.lead_appointments,
  public.lead_attachments,
  public.lead_links,
  public.leads,
  public.message_logs,
  public.place_cache,
  public.settings
to anon;

grant usage, select on all sequences in schema public to anon;

drop policy if exists "Anon CRM access" on public.activities;
create policy "Anon CRM access" on public.activities for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.app_notifications;
create policy "Anon CRM access" on public.app_notifications for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.caller_sessions;
create policy "Anon CRM access" on public.caller_sessions for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.callers;
create policy "Anon CRM access" on public.callers for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.campaign_runs;
create policy "Anon CRM access" on public.campaign_runs for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.campaigns;
create policy "Anon CRM access" on public.campaigns for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.finder_candidates;
create policy "Anon CRM access" on public.finder_candidates for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.finder_runs;
create policy "Anon CRM access" on public.finder_runs for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.lead_appointments;
create policy "Anon CRM access" on public.lead_appointments for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.lead_attachments;
create policy "Anon CRM access" on public.lead_attachments for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.lead_links;
create policy "Anon CRM access" on public.lead_links for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.leads;
create policy "Anon CRM access" on public.leads for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.message_logs;
create policy "Anon CRM access" on public.message_logs for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.place_cache;
create policy "Anon CRM access" on public.place_cache for all to anon using (true) with check (true);

drop policy if exists "Anon CRM access" on public.settings;
create policy "Anon CRM access" on public.settings for all to anon using (true) with check (true);

drop policy if exists "Anon lead attachments access" on storage.objects;
create policy "Anon lead attachments access"
on storage.objects for all to anon
using (bucket_id = 'lead-attachments')
with check (bucket_id = 'lead-attachments');
