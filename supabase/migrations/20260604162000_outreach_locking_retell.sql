alter table public.leads
  add column if not exists business_name text,
  add column if not exists owner_name text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists business_type text,
  add column if not exists lead_score integer,
  add column if not exists tools_used jsonb not null default '{}'::jsonb,
  add column if not exists outreach_state text not null default 'not_contacted',
  add column if not exists outreach_count integer not null default 0,
  add column if not exists outreach_history jsonb not null default '[]'::jsonb,
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists call_status text not null default 'New',
  add column if not exists last_called_at timestamptz,
  add column if not exists retell_call_id text,
  add column if not exists retell_agent_id text,
  add column if not exists call_outcome text,
  add column if not exists call_summary text,
  add column if not exists call_transcript text,
  add column if not exists demo_delivery_method text,
  add column if not exists demo_contact_value text,
  add column if not exists next_step text;

create unique index if not exists leads_retell_call_id_unique
  on public.leads(retell_call_id)
  where retell_call_id is not null;

create index if not exists leads_outreach_state_idx on public.leads(outreach_state);
create index if not exists leads_normalized_email_idx on public.leads(lower(email)) where email is not null;
create index if not exists leads_normalized_phone_idx on public.leads(regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g')) where phone is not null;
