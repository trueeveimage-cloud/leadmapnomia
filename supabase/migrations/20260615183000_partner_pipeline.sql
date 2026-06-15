create table if not exists public.partner_prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  email text,
  phone text,
  country text,
  city text,
  address text,
  partner_type text not null default 'consultant',
  status text not null default 'new',
  fit_score integer not null default 0,
  fit_reason text,
  source_url text,
  source text not null default 'partner_finder',
  notes text,
  do_not_contact boolean not null default false,
  last_contacted_at timestamptz,
  last_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_prospects_status_check check (status in (
    'new',
    'researching',
    'ready_to_contact',
    'contacted',
    'replied',
    'partner_call_booked',
    'qualified',
    'not_fit',
    'do_not_contact'
  )),
  constraint partner_prospects_type_check check (partner_type in (
    'telecom',
    'pbx_voip',
    'agency_marketer',
    'installer',
    'consultant'
  ))
);

create table if not exists public.partner_outreach_logs (
  id uuid primary key default gen_random_uuid(),
  partner_prospect_id uuid references public.partner_prospects(id) on delete cascade,
  channel text not null default 'email',
  direction text not null default 'outbound',
  status text not null default 'sent',
  subject text,
  body text,
  to_email text,
  provider text,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists partner_prospects_email_unique
  on public.partner_prospects(lower(email))
  where email is not null and email <> '';

create unique index if not exists partner_prospects_website_unique
  on public.partner_prospects(lower(website))
  where website is not null and website <> '';

create index if not exists partner_prospects_status_idx on public.partner_prospects(status);
create index if not exists partner_prospects_type_idx on public.partner_prospects(partner_type);
create index if not exists partner_outreach_logs_prospect_idx on public.partner_outreach_logs(partner_prospect_id);

alter table public.partner_prospects enable row level security;
alter table public.partner_outreach_logs enable row level security;

drop policy if exists "Partner prospects CRM access" on public.partner_prospects;
create policy "Partner prospects CRM access"
  on public.partner_prospects for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Partner logs CRM access" on public.partner_outreach_logs;
create policy "Partner logs CRM access"
  on public.partner_outreach_logs for all
  to anon, authenticated
  using (true)
  with check (true);

