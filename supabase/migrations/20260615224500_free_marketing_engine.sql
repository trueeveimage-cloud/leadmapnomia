alter table public.leads
  add column if not exists lead_source text,
  add column if not exists source_page text,
  add column if not exists source_campaign text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists preferred_contact_method text,
  add column if not exists audit_data jsonb,
  add column if not exists website_demo_requested boolean default false,
  add column if not exists seo_landing_page text,
  add column if not exists case_study_page text;

create table if not exists public.gbp_post_drafts (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  scheduled_for date not null,
  theme text not null,
  title text not null,
  body text not null,
  cta text not null default 'Fa gratis missade-samtal audit',
  link text not null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_free_marketing_source
  on public.leads (product, lead_source, created_at desc);

create index if not exists idx_gbp_post_drafts_scheduled_for
  on public.gbp_post_drafts (scheduled_for desc);

create unique index if not exists idx_gbp_post_drafts_unique_theme_date
  on public.gbp_post_drafts (scheduled_for, theme);

alter table public.gbp_post_drafts enable row level security;

drop policy if exists "Authenticated access on gbp_post_drafts" on public.gbp_post_drafts;
create policy "Authenticated access on gbp_post_drafts"
  on public.gbp_post_drafts for all to authenticated using (true) with check (true);

drop policy if exists "Anon CRM access on gbp_post_drafts" on public.gbp_post_drafts;
create policy "Anon CRM access on gbp_post_drafts"
  on public.gbp_post_drafts for all to anon using (true) with check (true);
