-- Nomia-first private workspace, reviewed outreach batches, and fail-closed safety.

alter table public.profiles add column if not exists role text not null default 'viewer';

insert into public.profiles(user_id, display_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', u.email, 'CRM owner'), 'owner'
from auth.users u
where not exists (select 1 from public.profiles where role = 'owner')
order by u.created_at asc
limit 1
on conflict (user_id) do update set role = 'owner';

with first_profile as (
  select id from public.profiles order by created_at asc limit 1
)
update public.profiles set role = 'owner'
where id in (select id from first_profile)
  and not exists (select 1 from public.profiles where role = 'owner');

create or replace function public.is_crm_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'owner'
  )
$$;

alter table public.campaigns
  add column if not exists channel text not null default 'sms',
  add column if not exists approval_status text not null default 'draft',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists email_subject text;

update public.campaigns set channel = 'sms' where channel is null;
update public.campaigns set approval_status = 'draft' where approval_status is null;
update public.campaigns
set channel = 'sms'
where created_at < '2026-08-24 01:18:06+00'::timestamptz
  and email_subject is null
  and channel = 'email';

create index if not exists campaigns_workspace_review_idx
  on public.campaigns(product, channel, approval_status, created_at desc);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  position integer not null default 0,
  rendered_subject text,
  rendered_body text,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending_review',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, lead_id)
);

alter table public.campaign_recipients
  add column if not exists position integer not null default 0,
  add column if not exists rendered_subject text,
  add column if not exists rendered_body text,
  add column if not exists eligibility_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'pending_review',
  add column if not exists sent_at timestamptz,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists campaign_recipients_campaign_status_idx
  on public.campaign_recipients(campaign_id, status, position);
create index if not exists campaign_recipients_lead_idx
  on public.campaign_recipients(lead_id, created_at desc);

alter table public.app_notifications
  add column if not exists product text,
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

update public.app_notifications n
set lead_id = nullif(n.payload->>'leadId', '')::uuid
where n.lead_id is null
  and coalesce(n.payload->>'leadId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update public.app_notifications n
set product = coalesce(
  nullif(n.payload->>'product', ''),
  (select l.product from public.leads l where l.id = n.lead_id),
  'leadmap'
)
where n.product is null;

alter table public.app_notifications alter column product set default 'nomia';
alter table public.app_notifications alter column product set not null;
create index if not exists app_notifications_product_unread_idx
  on public.app_notifications(product, created_at desc) where read_at is null;

create or replace function public.set_notification_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lead_id is null and coalesce(new.payload->>'leadId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new.lead_id := (new.payload->>'leadId')::uuid;
  end if;
  new.product := coalesce(
    nullif(new.product, ''),
    nullif(new.payload->>'product', ''),
    (select l.product from public.leads l where l.id = new.lead_id),
    'leadmap'
  );
  return new;
end;
$$;

drop trigger if exists set_notification_workspace_trigger on public.app_notifications;
create trigger set_notification_workspace_trigger
before insert or update on public.app_notifications
for each row execute function public.set_notification_workspace();

alter table public.outreach_locks
  add column if not exists unlocked_at timestamptz,
  add column if not exists unlocked_by uuid references auth.users(id) on delete set null,
  add column if not exists unlocked_for_lead_id uuid references public.leads(id) on delete set null,
  add column if not exists unlock_method text,
  add column if not exists unlock_reason text;

insert into public.settings(key, value) values
  ('outreach_master_paused', 'true'),
  ('nomia_gmail_paused', 'true'),
  ('nomia_ai_calls_paused', 'true'),
  ('nomia_sms_paused', 'true'),
  ('partner_outreach_paused', 'true'),
  ('nomia_gmail_batch_cap', '10'),
  ('nomia_ai_call_batch_cap', '5'),
  ('gmail_autosend_enabled', 'false'),
  ('ai_calls_enabled', 'false'),
  ('followup_enabled', 'false'),
  ('partner_gmail_auto_enabled', 'false')
on conflict (key) do update set value = excluded.value;

do $$
declare job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for job in
      select jobid from cron.job
      where jobname ilike '%gmail%' or jobname ilike '%call%' or jobname ilike '%sms%' or jobname ilike '%partner%'
    loop
      perform cron.unschedule(job.jobid);
    end loop;
  end if;
exception when others then
  raise notice 'Could not remove outreach cron jobs: %', sqlerrm;
end $$;

create or replace function public.unlock_outreach_identity(
  p_lead_id uuid,
  p_method text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_count integer;
begin
  if not public.is_crm_owner() then
    return jsonb_build_object('allowed', false, 'reason', 'owner_required');
  end if;
  if p_method not in ('email', 'sms', 'call', 'ai_call') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_method');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 8 then
    return jsonb_build_object('allowed', false, 'reason', 'unlock_reason_required');
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'lead_not_found'); end if;
  if coalesce(v_lead.do_not_contact, false) or coalesce(v_lead.outreach_opt_out, false)
    or coalesce(v_lead.outreach_state, '') = 'do_not_contact'
    or coalesce(v_lead.call_status, '') = 'Do not contact' then
    return jsonb_build_object('allowed', false, 'reason', 'do_not_contact');
  end if;

  update public.outreach_locks
  set manually_unlocked = true,
      unlocked_at = now(),
      unlocked_by = auth.uid(),
      unlocked_for_lead_id = p_lead_id,
      unlock_method = p_method,
      unlock_reason = trim(p_reason)
  where (lock_type = 'email' and lock_value = public.normalize_outreach_email(v_lead.email))
     or (lock_type = 'phone' and lock_value = public.normalize_outreach_phone(coalesce(v_lead.phone_e164, v_lead.phone)))
     or (lock_type = 'domain' and lock_value = public.normalize_outreach_domain(v_lead.website))
     or (lock_type = 'place' and lock_value = nullif(lower(trim(coalesce(v_lead.place_id, ''))), ''))
     or (lock_type = 'business' and lock_value = public.normalize_outreach_identity(coalesce(v_lead.business_name, v_lead.name, '') || ' ' || coalesce(v_lead.address, '')));
  get diagnostics v_count = row_count;

  insert into public.activities(lead_id, type, payload)
  values (p_lead_id, 'outreach_identity_unlocked', jsonb_build_object('method', p_method, 'reason', trim(p_reason), 'locks', v_count, 'user_id', auth.uid()));
  return jsonb_build_object('allowed', true, 'locks_unlocked', v_count);
end;
$$;

create or replace function public.acquire_outreach_lock(
  p_lead_id uuid,
  p_method text,
  p_manual_unlock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_identity jsonb;
  v_identities jsonb := '[]'::jsonb;
  v_existing record;
  v_setting text;
  v_consumed_unlock boolean := false;
begin
  if p_method not in ('email', 'sms', 'call', 'ai_call') then return jsonb_build_object('allowed', false, 'reason', 'invalid_method'); end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_crm_owner() then
    return jsonb_build_object('allowed', false, 'reason', 'owner_required');
  end if;
  if p_manual_unlock then return jsonb_build_object('allowed', false, 'reason', 'audited_unlock_required'); end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'lead_not_found'); end if;
  if coalesce(v_lead.do_not_contact, false) or coalesce(v_lead.outreach_opt_out, false)
    or coalesce(v_lead.outreach_state, '') = 'do_not_contact'
    or coalesce(v_lead.call_status, '') = 'Do not contact' then
    return jsonb_build_object('allowed', false, 'reason', 'do_not_contact');
  end if;

  select value into v_setting from public.settings where key = 'outreach_master_paused';
  if coalesce(v_setting, 'true') <> 'false' then return jsonb_build_object('allowed', false, 'reason', 'master_paused'); end if;
  if coalesce(v_lead.product, 'nomia') = 'nomia' then
    if p_method = 'email' then select value into v_setting from public.settings where key = 'nomia_gmail_paused'; end if;
    if p_method = 'ai_call' then select value into v_setting from public.settings where key = 'nomia_ai_calls_paused'; end if;
    if p_method = 'sms' then select value into v_setting from public.settings where key = 'nomia_sms_paused'; end if;
    if p_method in ('email', 'ai_call', 'sms') and coalesce(v_setting, 'true') <> 'false' then
      return jsonb_build_object('allowed', false, 'reason', p_method || '_paused');
    end if;
  end if;

  if public.normalize_outreach_email(v_lead.email) is not null then v_identities := v_identities || jsonb_build_array(jsonb_build_object('type','email','value',public.normalize_outreach_email(v_lead.email))); end if;
  if public.normalize_outreach_phone(coalesce(v_lead.phone_e164,v_lead.phone)) is not null then v_identities := v_identities || jsonb_build_array(jsonb_build_object('type','phone','value',public.normalize_outreach_phone(coalesce(v_lead.phone_e164,v_lead.phone)))); end if;
  if public.normalize_outreach_domain(v_lead.website) is not null then v_identities := v_identities || jsonb_build_array(jsonb_build_object('type','domain','value',public.normalize_outreach_domain(v_lead.website))); end if;
  if nullif(lower(trim(coalesce(v_lead.place_id,''))), '') is not null then v_identities := v_identities || jsonb_build_array(jsonb_build_object('type','place','value',nullif(lower(trim(v_lead.place_id)),''))); end if;
  if public.normalize_outreach_identity(coalesce(v_lead.business_name,v_lead.name,'') || ' ' || coalesce(v_lead.address,'')) is not null then v_identities := v_identities || jsonb_build_array(jsonb_build_object('type','business','value',public.normalize_outreach_identity(coalesce(v_lead.business_name,v_lead.name,'') || ' ' || coalesce(v_lead.address,'')))); end if;

  if (p_method = 'email' and public.normalize_outreach_email(v_lead.email) is null) then return jsonb_build_object('allowed', false, 'reason', 'missing_email'); end if;
  if (p_method in ('sms','call','ai_call') and public.normalize_outreach_phone(coalesce(v_lead.phone_e164,v_lead.phone)) is null) then return jsonb_build_object('allowed', false, 'reason', 'missing_phone'); end if;

  for v_identity in select * from jsonb_array_elements(v_identities) loop
    select * into v_existing from public.outreach_locks
    where lock_type = v_identity->>'type' and lock_value = v_identity->>'value' limit 1 for update;
    if found then
      if v_existing.manually_unlocked and v_existing.unlocked_for_lead_id = p_lead_id and v_existing.unlock_method = p_method then
        v_consumed_unlock := true;
      else
        return jsonb_build_object('allowed', false, 'reason', 'duplicate_business_identity', 'lock_type', v_existing.lock_type, 'existing_lead_id', v_existing.lead_id, 'existing_method', v_existing.method);
      end if;
    end if;
  end loop;

  for v_identity in select * from jsonb_array_elements(v_identities) loop
    insert into public.outreach_locks(lead_id,lock_type,lock_value,method,manually_unlocked)
    values (p_lead_id,v_identity->>'type',v_identity->>'value',p_method,false)
    on conflict (lock_type,lock_value) do update set lead_id = excluded.lead_id, method = excluded.method, manually_unlocked = false, unlocked_at = null, unlocked_by = null, unlocked_for_lead_id = null, unlock_method = null, unlock_reason = null;
  end loop;
  return jsonb_build_object('allowed', true, 'identities', v_identities, 'consumed_unlock', v_consumed_unlock);
end;
$$;

revoke execute on function public.acquire_outreach_lock(uuid,text,boolean) from public, anon;
grant execute on function public.acquire_outreach_lock(uuid,text,boolean) to authenticated, service_role;
revoke execute on function public.unlock_outreach_identity(uuid,text,text) from public, anon;
grant execute on function public.unlock_outreach_identity(uuid,text,text) to authenticated;

create index if not exists leads_product_country_status_idx on public.leads(product, country, status);
create index if not exists leads_product_followup_idx on public.leads(product, next_action_at) where next_action_at is not null;

do $$
declare r record;
declare tables text[] := array['leads','activities','settings','finder_runs','finder_candidates','place_cache','message_logs','campaigns','campaign_runs','campaign_recipients','lead_appointments','app_notifications','outreach_locks','lead_attachments','lead_links'];
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' and tablename = any(tables)
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
  for r in select unnest(tables) as tablename
  loop
    if to_regclass('public.' || r.tablename) is not null then
      execute format('alter table public.%I enable row level security', r.tablename);
      execute format('revoke all on public.%I from anon', r.tablename);
      execute format('grant select, insert, update, delete on public.%I to authenticated', r.tablename);
      execute format('create policy %I on public.%I for all to authenticated using (public.is_crm_owner()) with check (public.is_crm_owner())', 'Owner access on ' || r.tablename, r.tablename);
    end if;
  end loop;
end $$;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Owner access on profiles" on public.profiles;
create policy "Owner access on profiles" on public.profiles for all to authenticated
using (user_id = auth.uid() or public.is_crm_owner())
with check (user_id = auth.uid() or public.is_crm_owner());
