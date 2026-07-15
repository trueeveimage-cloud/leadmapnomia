create table if not exists digest_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  recipient_email text not null,
  digest_date date not null,
  status text not null default 'processing',
  item_count integer not null default 0,
  provider_message_id text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, recipient_email, digest_date)
);

create index if not exists digest_delivery_runs_status_idx
  on digest_delivery_runs(status, updated_at desc);
