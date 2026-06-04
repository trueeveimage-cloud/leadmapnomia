create table if not exists public.outreach_locks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  lock_type text not null check (lock_type in ('email', 'phone', 'domain')),
  lock_value text not null,
  method text not null check (method in ('email', 'sms', 'call', 'ai_call')),
  manually_unlocked boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists outreach_locks_unique_identity
  on public.outreach_locks(lock_type, lock_value);

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
  v_lock_type text;
  v_lock_value text;
  v_domain text;
  v_existing record;
  v_warnings jsonb := '[]'::jsonb;
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

  if p_method = 'email' then
    v_lock_type := 'email';
    v_lock_value := public.normalize_outreach_email(v_lead.email);
    if v_lock_value is null then
      return jsonb_build_object('allowed', false, 'reason', 'missing_email');
    end if;
    if coalesce(v_lead.outreach_state, '') = 'email_sent' and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_email_sent');
    end if;
  elsif p_method = 'sms' then
    v_lock_type := 'phone';
    v_lock_value := public.normalize_outreach_phone(coalesce(v_lead.phone_e164, v_lead.phone));
    if v_lock_value is null then
      return jsonb_build_object('allowed', false, 'reason', 'missing_phone');
    end if;
    if coalesce(v_lead.outreach_state, '') = 'sms_sent' and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_sms_sent');
    end if;
  else
    v_lock_type := 'phone';
    v_lock_value := public.normalize_outreach_phone(coalesce(v_lead.phone_e164, v_lead.phone));
    if v_lock_value is null then
      return jsonb_build_object('allowed', false, 'reason', 'missing_phone');
    end if;
    if coalesce(v_lead.call_status, '') = 'Calling' then
      return jsonb_build_object('allowed', false, 'reason', 'already_calling');
    end if;
    if coalesce(v_lead.call_attempts, 0) >= 2 and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'call_attempt_limit');
    end if;
    if coalesce(v_lead.outreach_state, '') = 'called' and not p_manual_unlock then
      return jsonb_build_object('allowed', false, 'reason', 'already_called');
    end if;
  end if;

  select * into v_existing
  from public.outreach_locks
  where lock_type = v_lock_type and lock_value = v_lock_value
  limit 1;

  if found and not p_manual_unlock then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate_' || v_lock_type,
      'existing_lead_id', v_existing.lead_id
    );
  end if;

  if not found then
    insert into public.outreach_locks(lead_id, lock_type, lock_value, method, manually_unlocked)
    values (p_lead_id, v_lock_type, v_lock_value, p_method, p_manual_unlock);
  end if;

  v_domain := public.normalize_outreach_domain(v_lead.website);
  if v_domain is not null then
    select * into v_existing
    from public.outreach_locks
    where lock_type = 'domain' and lock_value = v_domain
    limit 1;

    if found and v_existing.lead_id <> p_lead_id then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'type', 'duplicate_domain',
        'domain', v_domain,
        'existing_lead_id', v_existing.lead_id
      ));
    elsif not found then
      insert into public.outreach_locks(lead_id, lock_type, lock_value, method, manually_unlocked)
      values (p_lead_id, 'domain', v_domain, p_method, p_manual_unlock);
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'warnings', v_warnings);
end;
$$;
