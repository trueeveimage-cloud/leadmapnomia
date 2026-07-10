create table if not exists contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text not null,
  team_size text,
  message text not null,
  source text not null default 'website',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_requests_status_created_idx
  on contact_requests(status, created_at desc);

delete from notification_settings newer
using notification_settings older
where newer.organization_id = older.organization_id
  and lower(newer.recipient_email) = lower(older.recipient_email)
  and (newer.created_at, newer.id) > (older.created_at, older.id);

create unique index if not exists notification_settings_org_recipient_unique
  on notification_settings(organization_id, recipient_email);
