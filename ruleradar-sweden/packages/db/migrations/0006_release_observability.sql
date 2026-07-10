create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_status_idx
  on stripe_webhook_events(status, updated_at desc);

create table if not exists conversion_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  event_name text not null,
  path text not null,
  referrer_host text,
  utm jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversion_events_name_created_idx
  on conversion_events(event_name, created_at desc);
