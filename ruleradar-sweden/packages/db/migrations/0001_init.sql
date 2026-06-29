create extension if not exists pgcrypto;

do $$ begin
  create type severity as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;
do $$ begin
  create type fetch_strategy as enum ('html', 'news_index', 'pdf', 'document_page', 'browser_fallback');
exception when duplicate_object then null; end $$;
do $$ begin
  create type alert_status as enum ('draft', 'review_required', 'approved', 'sent', 'suppressed', 'archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type org_role as enum ('owner', 'member', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  password_hash text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_email text,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists plans (
  id text primary key,
  name text not null,
  monthly_sek integer not null,
  included_seats integer not null,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  plan_id text not null references plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agency text not null,
  url text not null unique,
  strategy fetch_strategy not null,
  topics jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  priority text not null default 'core',
  requires_review_by_default boolean not null default false,
  health_status text not null default 'unknown',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists source_runs_source_idx on source_runs(source_id);

create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  run_id uuid references source_runs(id),
  content_hash text not null,
  normalized_text text not null,
  page_hashes jsonb not null default '{}'::jsonb,
  fetch_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, content_hash)
);
create index if not exists source_snapshots_source_idx on source_snapshots(source_id);

create table if not exists detected_changes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  previous_snapshot_id uuid,
  current_snapshot_id uuid references source_snapshots(id),
  severity severity not null,
  topics jsonb not null default '[]'::jsonb,
  diff_excerpt text not null,
  changed_ratio numeric not null,
  summary_json jsonb not null default '{}'::jsonb,
  status alert_status not null default 'draft',
  needs_human_review boolean not null default false,
  reason_codes jsonb not null default '[]'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists detected_changes_source_idx on detected_changes(source_id);

create table if not exists change_reviews (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references detected_changes(id),
  reviewer_user_id uuid references users(id),
  decision text not null,
  edited_summary_json jsonb,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  change_id uuid not null references detected_changes(id),
  status alert_status not null default 'draft',
  subject text not null,
  html_body text not null,
  text_body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alerts_org_idx on alerts(organization_id);

create table if not exists alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id),
  recipient_email text not null,
  provider text not null,
  provider_message_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists notification_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  recipient_email text not null,
  immediate boolean not null default true,
  daily_digest boolean not null default true,
  topics jsonb not null default '[]'::jsonb,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  organization_id uuid references organizations(id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists api_keys_or_system_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null,
  scopes jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
