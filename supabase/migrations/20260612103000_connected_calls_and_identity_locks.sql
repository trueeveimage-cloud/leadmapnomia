alter table public.leads
  add column if not exists call_connected boolean not null default false;

create index if not exists idx_leads_call_connected_contacted
  on public.leads(last_contacted_at)
  where call_connected = true;

create or replace function public.normalize_outreach_email(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(value, ''))), '')
$$;

create or replace function public.normalize_outreach_phone(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(value, ''), '[^0-9+]', '', 'g'), '')
$$;

create or replace function public.normalize_outreach_domain(value text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
begin
  cleaned := lower(trim(coalesce(value, '')));
  cleaned := regexp_replace(cleaned, '^https?://', '');
  cleaned := regexp_replace(cleaned, '^www\.', '');
  cleaned := split_part(cleaned, '/', 1);
  return nullif(cleaned, '');
end;
$$;

alter table public.outreach_locks
  drop constraint if exists outreach_locks_lock_type_check;

alter table public.outreach_locks
  add constraint outreach_locks_lock_type_check
  check (lock_type in ('email', 'phone', 'domain', 'place', 'business'));

create or replace function public.normalize_outreach_identity(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'), '')
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
  v_email text;
  v_phone text;
  v_domain text;
  v_place text;
  v_business text;
  v_identity jsonb;
  v_identities jsonb := '[]'::jsonb;
  v_existing record;
  v_prior int;
begin
  if p_method not in ('email', 'sms', 'call', 'ai_call') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_method');
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'lead_not_found');
  end if;

  if coalesce(v_lead.do_not_contact, false)
    or coalesce(v_lead.outreach_opt_out, false)
    or coalesce(v_lead.outreach_state, '') = 'do_not_contact'
    or coalesce(v_lead.call_status, '') = 'Do not contact'
  then
    return jsonb_build_object('allowed', false, 'reason', 'do_not_contact');
  end if;

  v_email := public.normalize_outreach_email(v_lead.email);
  v_phone := public.normalize_outreach_phone(coalesce(v_lead.phone_e164, v_lead.phone));
  v_domain := public.normalize_outreach_domain(v_lead.website);
  v_place := nullif(lower(trim(coalesce(v_lead.place_id, ''))), '');
  v_business := public.normalize_outreach_identity(coalesce(v_lead.business_name, v_lead.name, '') || ' ' || coalesce(v_lead.address, ''));

  if v_email is not null then
    v_identities := v_identities || jsonb_build_array(jsonb_build_object('type', 'email', 'value', v_email));
  end if;
  if v_phone is not null then
    v_identities := v_identities || jsonb_build_array(jsonb_build_object('type', 'phone', 'value', v_phone));
  end if;
  if v_domain is not null then
    v_identities := v_identities || jsonb_build_array(jsonb_build_object('type', 'domain', 'value', v_domain));
  end if;
  if v_place is not null then
    v_identities := v_identities || jsonb_build_array(jsonb_build_object('type', 'place', 'value', v_place));
  end if;
  if v_business is not null then
    v_identities := v_identities || jsonb_build_array(jsonb_build_object('type', 'business', 'value', v_business));
  end if;

  if p_method = 'email' then
    if v_email is null then
      return jsonb_build_object('allowed', false, 'reason', 'missing_email');
    end if;
    if coalesce(v_lead.outreach_state, '') = 'email_sent' and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_emailed');
    end if;
    select count(*) into v_prior
    from public.message_logs
    where lead_id = p_lead_id
      and channel = 'email'
      and direction = 'outbound'
      and status in ('sent', 'queued');
    if v_prior > 0 and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_emailed');
    end if;
    if coalesce(v_lead.last_contact_method, '') ilike 'AI Call%'
      or coalesce(v_lead.call_connected, false)
      or coalesce(v_lead.outreach_state, '') = 'called'
    then
      return jsonb_build_object('allowed', false, 'reason', 'already_called');
    end if;
  elsif p_method = 'sms' then
    if v_phone is null then
      return jsonb_build_object('allowed', false, 'reason', 'missing_phone');
    end if;
    if coalesce(v_lead.outreach_state, '') = 'sms_sent' and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_sms');
    end if;
  else
    if v_phone is null then
      return jsonb_build_object('allowed', false, 'reason', 'missing_phone');
    end if;
    if coalesce(v_lead.call_status, '') = 'Calling' then
      return jsonb_build_object('allowed', false, 'reason', 'already_calling');
    end if;
    if coalesce(v_lead.call_attempts, 0) >= 3 and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'call_attempt_limit');
    end if;
    if (coalesce(v_lead.outreach_state, '') = 'called' or coalesce(v_lead.call_connected, false)) and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_called');
    end if;
    select count(*) into v_prior
    from public.message_logs
    where lead_id = p_lead_id
      and channel = 'email'
      and direction = 'outbound'
      and status in ('sent', 'queued');
    if v_prior > 0 and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_emailed');
    end if;
  end if;

  if not p_manual_unlock then
    for v_identity in select * from jsonb_array_elements(v_identities)
    loop
      select * into v_existing
      from public.outreach_locks
      where lock_type = v_identity->>'type'
        and lock_value = v_identity->>'value'
      limit 1;

      if found
        and (
          v_existing.lead_id <> p_lead_id
          or v_existing.method <> p_method
        )
      then
        return jsonb_build_object(
          'allowed', false,
          'reason', 'duplicate_business_identity',
          'lock_type', v_existing.lock_type,
          'existing_lead_id', v_existing.lead_id,
          'existing_method', v_existing.method
        );
      end if;
    end loop;
  end if;

  for v_identity in select * from jsonb_array_elements(v_identities)
  loop
    insert into public.outreach_locks(lead_id, lock_type, lock_value, method, manually_unlocked)
    values (p_lead_id, v_identity->>'type', v_identity->>'value', p_method, p_manual_unlock)
    on conflict (lock_type, lock_value) do nothing;
  end loop;

  return jsonb_build_object('allowed', true, 'identities', v_identities);
end;
$$;

grant execute on function public.acquire_outreach_lock(uuid, text, boolean) to authenticated, service_role;

with contacted as (
  select
    l.*,
    case
      when coalesce(l.call_connected, false)
        or coalesce(l.last_contact_method, '') ilike 'AI Call%'
        or coalesce(l.outreach_state, '') = 'called'
      then 'ai_call'
      when exists (
        select 1 from public.message_logs ml
        where ml.lead_id = l.id
          and ml.channel = 'email'
          and ml.direction = 'outbound'
          and ml.status in ('sent', 'queued')
      )
      then 'email'
      else null
    end as lock_method
  from public.leads l
  where coalesce(l.call_connected, false)
    or coalesce(l.last_contact_method, '') ilike 'AI Call%'
    or coalesce(l.outreach_state, '') in ('called', 'email_sent')
    or exists (
      select 1 from public.message_logs ml
      where ml.lead_id = l.id
        and ml.channel = 'email'
        and ml.direction = 'outbound'
        and ml.status in ('sent', 'queued')
    )
),
identity_rows as (
  select id, lock_method, 'email'::text as lock_type, public.normalize_outreach_email(email) as lock_value from contacted
  union all
  select id, lock_method, 'phone', public.normalize_outreach_phone(coalesce(phone_e164, phone)) from contacted
  union all
  select id, lock_method, 'domain', public.normalize_outreach_domain(website) from contacted
  union all
  select id, lock_method, 'place', nullif(lower(trim(coalesce(place_id, ''))), '') from contacted
  union all
  select id, lock_method, 'business', public.normalize_outreach_identity(coalesce(business_name, name, '') || ' ' || coalesce(address, '')) from contacted
)
insert into public.outreach_locks(lead_id, lock_type, lock_value, method)
select id, lock_type, lock_value, coalesce(lock_method, 'email')
from identity_rows
where lock_value is not null
on conflict (lock_type, lock_value) do nothing;
