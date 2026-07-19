import { getPool } from "./client";
import { sampleSummaries, seedSources, severityRank } from "./fixtures";
import { idempotencyKey, loadConfig, type AlertStatus, type ContentSnapshot, type DetectedChangeDraft, type FetchStrategy, type MonitoredSource, type Severity, type SummaryResult } from "@ruleradar/shared";
import { renderAlertEmail, renderDailyDigestEmail, sendEmail } from "@ruleradar/notifications";

export interface AlertView extends SummaryResult {
  id: string;
  title: string;
  agency: string;
  status: AlertStatus | string;
  createdAt: string;
  diffExcerpt: string;
  sourceTitle?: string;
  deliveryStatus?: string;
}

export interface SourceView extends MonitoredSource {
  healthStatus?: string;
  lastCheckedAt?: string | null;
}

export interface AdminMetrics {
  sources: number;
  enabledSources: number;
  reviewQueue: number;
  organizations: number;
  sentAlerts: number;
  queuedDeliveries: number;
  failedDeliveries: number;
}

export interface WorkerHealth {
  ok: boolean;
  enabledSources: number;
  healthySources: number;
  degradedSources: number;
  staleSources: number;
  scans24h: number;
  failedScans24h: number;
  lastScanAt: string | null;
  staleAfterMinutes: number;
}

export const expectedMigrations = [
  "0001_init.sql",
  "0002_alert_delivery_uniqueness.sql",
  "0003_subscription_reconciliation.sql",
  "0004_public_launch.sql",
  "0005_account_recovery_team.sql",
  "0006_release_observability.sql",
  "0007_digest_delivery_runs.sql"
] as const;

export interface MigrationStatus {
  ok: boolean;
  applied: number;
  expected: number;
  missing: string[];
}

export interface NotificationRecipientView {
  id: string;
  organizationId: string;
  recipientEmail: string;
  immediate: boolean;
  dailyDigest: boolean;
  topics: string[];
}

export interface UserAuthProfile {
  userId: string;
  email: string;
  name?: string | null;
  passwordHash?: string | null;
  isPlatformAdmin: boolean;
  organizationId?: string | null;
  role?: string | null;
}

export interface SubscriptionView {
  organizationId: string;
  planId: string;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
}

export interface SubscriptionSyncInput {
  organizationId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planId?: string | null;
  status: string;
  currentPeriodEnd?: Date | null;
}

export interface DeliveryRunResult {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface RetentionCleanupResult {
  passwordResetTokens: number;
  organizationInvites: number;
  conversionEvents: number;
  contactRequests: number;
}

export interface DailyDigestOptions {
  force?: boolean;
  limit?: number;
  now?: Date;
}

export interface ContactRequestInput {
  name: string;
  email: string;
  company: string;
  teamSize?: string;
  message: string;
  source?: string;
}

export interface ContactRequestView extends Required<Omit<ContactRequestInput, "teamSize">> {
  id: string;
  teamSize?: string | null;
  status: string;
  createdAt: string;
}

export interface OrganizationMemberView {
  membershipId: string;
  userId: string;
  name?: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

export interface OrganizationInviteView {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export interface ConversionEventInput {
  anonymousId: string;
  eventName: string;
  path: string;
  referrerHost?: string;
  utm?: Record<string, string>;
  metadata?: Record<string, string>;
}

export function databaseConfigured() {
  return Boolean(loadConfig().DATABASE_URL);
}

export async function createContactRequest(input: ContactRequestInput) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const { rows } = await pool.query(`
    insert into contact_requests (name, email, company, team_size, message, source)
    values ($1, $2, $3, $4, $5, $6)
    returning id::text
  `, [input.name, input.email.toLowerCase(), input.company, input.teamSize || null, input.message, input.source || "website"]);
  return { mode: "database" as const, requestId: rows[0].id as string };
}

export async function listContactRequests(limit = 20): Promise<ContactRequestView[]> {
  if (!databaseConfigured()) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const pool = getPool();
  const { rows } = await pool.query(`
    select id::text, name, email, company, team_size, message, source, status, created_at
    from contact_requests
    order by
      case status when 'new' then 1 when 'contacted' then 2 when 'qualified' then 3 when 'pilot' then 4 else 5 end,
      created_at desc
    limit $1
  `, [safeLimit]);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    teamSize: row.team_size,
    message: row.message,
    source: row.source,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString()
  }));
}

export async function updateContactRequestStatus(id: string, status: "new" | "contacted" | "qualified" | "pilot" | "won" | "lost") {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const { rowCount } = await pool.query(`update contact_requests set status = $2, updated_at = now() where id = $1::uuid`, [id, status]);
  return { mode: "database" as const, updated: rowCount === 1 };
}

export async function createConversionEvent(input: ConversionEventInput) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  await pool.query(`
    insert into conversion_events (anonymous_id, event_name, path, referrer_host, utm, metadata)
    values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
  `, [input.anonymousId, input.eventName, input.path, input.referrerHost || null, JSON.stringify(input.utm || {}), JSON.stringify(input.metadata || {})]);
  return { mode: "database" as const };
}

export async function getConversionMetrics() {
  if (!databaseConfigured()) return { visitors: 0, pricingViews: 0, trialClicks: 0, contactRequests: 0, signups: 0, checkouts: 0, activated: 0 };
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      count(distinct anonymous_id) filter (where event_name = 'page_view')::int as visitors,
      count(*) filter (where event_name = 'page_view' and path = '/pricing')::int as pricing_views,
      count(*) filter (where event_name = 'trial_click')::int as trial_clicks,
      (select count(*)::int from contact_requests where created_at >= now() - interval '30 days') as contact_requests,
      (select count(*)::int from subscriptions where created_at >= now() - interval '30 days') as signups,
      (select count(*)::int from subscriptions where created_at >= now() - interval '30 days' and status <> 'signup_started') as checkouts,
      (select count(*)::int from subscriptions where created_at >= now() - interval '30 days' and status in ('trialing', 'active', 'cancel_at_period_end')) as activated
    from conversion_events
    where created_at >= now() - interval '30 days'
  `);
  const row = rows[0] || {};
  return {
    visitors: row.visitors || 0,
    pricingViews: row.pricing_views || 0,
    trialClicks: row.trial_clicks || 0,
    contactRequests: row.contact_requests || 0,
    signups: row.signups || 0,
    checkouts: row.checkouts || 0,
    activated: row.activated || 0
  };
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  if (!databaseConfigured()) {
    return { ok: false, applied: 0, expected: expectedMigrations.length, missing: [...expectedMigrations] };
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query("select name from schema_migrations");
    const appliedNames = new Set(rows.map((row) => String(row.name)));
    const missing = expectedMigrations.filter((name) => !appliedNames.has(name));
    return { ok: missing.length === 0, applied: expectedMigrations.length - missing.length, expected: expectedMigrations.length, missing };
  } catch {
    return { ok: false, applied: 0, expected: expectedMigrations.length, missing: [...expectedMigrations] };
  }
}

export async function runRetentionCleanup(): Promise<RetentionCleanupResult> {
  const empty = { passwordResetTokens: 0, organizationInvites: 0, conversionEvents: 0, contactRequests: 0 };
  if (!databaseConfigured()) return empty;
  const pool = getPool();
  const { rows } = await pool.query(`
    with deleted_password_tokens as (
      delete from password_reset_tokens
      where created_at < now() - interval '30 days'
        and (used_at is not null or expires_at < now())
      returning 1
    ), deleted_invites as (
      delete from organization_invites
      where created_at < now() - interval '30 days'
        and (accepted_at is not null or expires_at < now())
      returning 1
    ), deleted_conversion_events as (
      delete from conversion_events
      where created_at < now() - interval '13 months'
      returning 1
    ), deleted_contact_requests as (
      delete from contact_requests
      where updated_at < now() - interval '12 months'
        and status not in ('pilot', 'won')
      returning 1
    )
    select
      (select count(*)::int from deleted_password_tokens) as password_reset_tokens,
      (select count(*)::int from deleted_invites) as organization_invites,
      (select count(*)::int from deleted_conversion_events) as conversion_events,
      (select count(*)::int from deleted_contact_requests) as contact_requests
  `);
  const row = rows[0] || empty;
  return {
    passwordResetTokens: Number(row.password_reset_tokens || 0),
    organizationInvites: Number(row.organization_invites || 0),
    conversionEvents: Number(row.conversion_events || 0),
    contactRequests: Number(row.contact_requests || 0)
  };
}

export async function claimStripeWebhookEvent(eventId: string, eventType: string) {
  if (!databaseConfigured()) return true;
  const pool = getPool();
  const { rows } = await pool.query(`
    insert into stripe_webhook_events (event_id, event_type, status)
    values ($1, $2, 'processing')
    on conflict (event_id) do update set
      event_type = excluded.event_type,
      status = 'processing',
      error = null,
      updated_at = now()
    where stripe_webhook_events.status = 'failed'
       or (stripe_webhook_events.status = 'processing' and stripe_webhook_events.updated_at < now() - interval '5 minutes')
    returning event_id
  `, [eventId, eventType]);
  return rows.length > 0;
}

export async function completeStripeWebhookEvent(eventId: string, status: "processed" | "failed", result?: unknown, error?: string) {
  if (!databaseConfigured()) return;
  const pool = getPool();
  await pool.query(`update stripe_webhook_events set status = $2, result = $3::jsonb, error = $4, updated_at = now() where event_id = $1`, [eventId, status, JSON.stringify(result ?? null), error || null]);
}

export async function getOrganizationBillingContact(organizationId?: string | null) {
  if (!databaseConfigured() || !organizationId) return null;
  const pool = getPool();
  const { rows } = await pool.query(`select billing_email, name from organizations where id = $1 limit 1`, [organizationId]);
  return rows[0] ? { email: rows[0].billing_email as string | null, organizationName: rows[0].name as string } : null;
}

export async function createPasswordResetToken(email: string, tokenHash: string, expiresAt: Date) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const { rows: users } = await pool.query(`select id::text, email, name from users where lower(email) = lower($1) limit 1`, [email]);
  const user = users[0];
  if (!user) return { mode: "missing" as const };
  await pool.query(`update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`, [user.id]);
  await pool.query(`insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`, [user.id, tokenHash, expiresAt]);
  return { mode: "created" as const, email: user.email as string, name: user.name as string | null };
}

export async function consumePasswordResetToken(tokenHash: string, passwordHash: string) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(`
      select id::text, user_id::text
      from password_reset_tokens
      where token_hash = $1 and used_at is null and expires_at > now()
      for update
    `, [tokenHash]);
    const token = rows[0];
    if (!token) {
      await client.query("rollback");
      return { mode: "invalid" as const };
    }
    await client.query(`update users set password_hash = $2, updated_at = now() where id = $1`, [token.user_id, passwordHash]);
    await client.query(`update password_reset_tokens set used_at = now() where id = $1`, [token.id]);
    await client.query("commit");
    return { mode: "updated" as const, userId: token.user_id as string };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listOrganizationMembers(organizationId?: string | null): Promise<OrganizationMemberView[]> {
  if (!databaseConfigured() || !organizationId) return [];
  const pool = getPool();
  const { rows } = await pool.query(`
    select om.id::text as membership_id, u.id::text as user_id, u.name, u.email, om.role, om.created_at
    from organization_members om
    join users u on u.id = om.user_id
    where om.organization_id = $1
    order by case om.role when 'owner' then 1 when 'admin' then 2 else 3 end, om.created_at asc
  `, [organizationId]);
  return rows.map((row) => ({ membershipId: row.membership_id, userId: row.user_id, name: row.name, email: row.email, role: row.role, joinedAt: new Date(row.created_at).toISOString() }));
}

export async function listOrganizationInvites(organizationId?: string | null): Promise<OrganizationInviteView[]> {
  if (!databaseConfigured() || !organizationId) return [];
  const pool = getPool();
  const { rows } = await pool.query(`
    select id::text, email, role, expires_at, created_at
    from organization_invites
    where organization_id = $1 and accepted_at is null and expires_at > now()
    order by created_at desc
  `, [organizationId]);
  return rows.map((row) => ({ id: row.id, email: row.email, role: row.role, expiresAt: new Date(row.expires_at).toISOString(), createdAt: new Date(row.created_at).toISOString() }));
}

export async function getOrganizationSeatUsage(organizationId?: string | null) {
  if (!databaseConfigured() || !organizationId) return { includedSeats: 1, members: 0, pendingInvites: 0 };
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      coalesce(p.included_seats, 1)::int as included_seats,
      (select count(*)::int from organization_members where organization_id = $1) as members,
      (select count(*)::int from organization_invites where organization_id = $1 and accepted_at is null and expires_at > now()) as pending_invites
    from subscriptions s
    join plans p on p.id = s.plan_id
    where s.organization_id = $1
    limit 1
  `, [organizationId]);
  return rows[0] ? { includedSeats: rows[0].included_seats as number, members: rows[0].members as number, pendingInvites: rows[0].pending_invites as number } : { includedSeats: 1, members: 0, pendingInvites: 0 };
}

export async function createOrganizationInvite(input: { organizationId: string; email: string; role?: "member" | "admin"; tokenHash: string; invitedByUserId: string; expiresAt: Date }) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  await pool.query(`delete from organization_invites where organization_id = $1 and lower(email) = lower($2) and accepted_at is null and expires_at <= now()`, [input.organizationId, input.email]);
  const usage = await getOrganizationSeatUsage(input.organizationId);
  if (usage.members + usage.pendingInvites >= usage.includedSeats) return { mode: "seat_limit" as const };
  const { rows: existingMember } = await pool.query(`select 1 from organization_members om join users u on u.id = om.user_id where om.organization_id = $1 and lower(u.email) = lower($2) limit 1`, [input.organizationId, input.email]);
  if (existingMember.length) return { mode: "member_exists" as const };
  const { rows: existingInvite } = await pool.query(`select 1 from organization_invites where organization_id = $1 and lower(email) = lower($2) and accepted_at is null and expires_at > now() limit 1`, [input.organizationId, input.email]);
  if (existingInvite.length) return { mode: "invite_exists" as const };
  const { rows } = await pool.query(`
    insert into organization_invites (organization_id, email, role, token_hash, invited_by_user_id, expires_at)
    values ($1, $2, $3, $4, $5, $6)
    returning id::text
  `, [input.organizationId, input.email.toLowerCase(), input.role || "member", input.tokenHash, input.invitedByUserId, input.expiresAt]);
  return { mode: "created" as const, inviteId: rows[0].id as string };
}

export async function revokeOrganizationInvite(inviteId: string, organizationId: string) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  await pool.query(`delete from organization_invites where id = $1 and organization_id = $2 and accepted_at is null`, [inviteId, organizationId]);
  return { mode: "deleted" as const };
}

export async function acceptOrganizationInvite(input: { tokenHash: string; name: string; passwordHash: string }) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(`
      select id::text, organization_id::text, email, role
      from organization_invites
      where token_hash = $1 and accepted_at is null and expires_at > now()
      for update
    `, [input.tokenHash]);
    const invite = rows[0];
    if (!invite) {
      await client.query("rollback");
      return { mode: "invalid" as const };
    }
    const existing = await client.query(`select id::text from users where lower(email) = lower($1) limit 1`, [invite.email]);
    let userId: string;
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      const otherMembership = await client.query(`select 1 from organization_members where user_id = $1 and organization_id <> $2 limit 1`, [userId, invite.organization_id]);
      if (otherMembership.rows.length) {
        await client.query("rollback");
        return { mode: "existing_other_workspace" as const };
      }
      await client.query(`update users set name = coalesce(nullif($2, ''), name), password_hash = $3, updated_at = now() where id = $1`, [userId, input.name, input.passwordHash]);
    } else {
      const created = await client.query(`insert into users (email, name, password_hash) values ($1, $2, $3) returning id::text`, [invite.email, input.name, input.passwordHash]);
      userId = created.rows[0].id;
    }
    await client.query(`insert into organization_members (organization_id, user_id, role) values ($1, $2, $3) on conflict (organization_id, user_id) do update set role = excluded.role`, [invite.organization_id, userId, invite.role]);
    await client.query(`update organization_invites set accepted_at = now() where id = $1`, [invite.id]);
    await client.query("commit");
    return { mode: "accepted" as const, userId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSources(): Promise<SourceView[]> {
  if (!databaseConfigured()) {
    return seedSources.map((source) => ({ ...source, healthStatus: "fixture", lastCheckedAt: null }));
  }
  const pool = getPool();
  const { rows } = await pool.query(`
    select id::text, name, agency, url, strategy, topics, enabled, priority,
      requires_review_by_default, health_status, last_checked_at
    from sources
    order by
      case priority when 'core' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
      agency,
      name
  `);
  return rows.map(mapSourceRow);
}

export async function listEnabledSources(limit?: number): Promise<SourceView[]> {
  const sources = await listSources();
  const enabled = sources.filter((source) => source.enabled);
  return limit && limit > 0 ? enabled.slice(0, limit) : enabled;
}

export async function listAlerts(limit = 50, organizationId?: string): Promise<AlertView[]> {
  if (!databaseConfigured()) return fixtureAlerts().slice(0, limit);
  const pool = getPool();
  const alertJoin = organizationId ? "join alerts a on a.change_id = dc.id" : "left join alerts a on a.change_id = dc.id";
  const orgFilter = organizationId ? "where a.organization_id = $2::uuid" : "";
  const { rows } = await pool.query(`
    select dc.id::text, dc.severity, dc.topics, dc.diff_excerpt, dc.summary_json, dc.status,
      dc.needs_human_review, dc.created_at, s.name as source_name, s.agency, s.url,
      ss.fetch_metadata,
      case
        when count(ad.id) = 0 then 'not_sent'
        when bool_or(ad.status = 'failed') then 'failed'
        when bool_or(ad.status = 'queued_missing_resend_key') then 'queued_missing_resend_key'
        when bool_or(ad.status = 'queued') then 'queued'
        when bool_or(ad.status = 'digest_pending') then 'digest_pending'
        when bool_and(ad.status = 'sent') then 'sent'
        else max(ad.status)
      end as delivery_status
    from detected_changes dc
    join sources s on s.id = dc.source_id
    left join source_snapshots ss on ss.id = dc.current_snapshot_id
    ${alertJoin}
    left join alert_deliveries ad on ad.alert_id = a.id
    ${orgFilter}
    group by dc.id, s.id, ss.id
    order by dc.created_at desc
    limit $1
  `, organizationId ? [limit, organizationId] : [limit]);
  return rows.map(mapAlertRow);
}

export async function listReviewQueue(limit = 50): Promise<AlertView[]> {
  if (!databaseConfigured()) return fixtureAlerts().filter((alert) => alert.needs_human_review).slice(0, limit);
  const pool = getPool();
  const { rows } = await pool.query(`
    select dc.id::text, dc.severity, dc.topics, dc.diff_excerpt, dc.summary_json, dc.status,
      dc.needs_human_review, dc.created_at, s.name as source_name, s.agency, s.url,
      ss.fetch_metadata, 'not_sent' as delivery_status
    from detected_changes dc
    join sources s on s.id = dc.source_id
    left join source_snapshots ss on ss.id = dc.current_snapshot_id
    where dc.needs_human_review = true and dc.status in ('draft', 'review_required')
    order by dc.created_at desc
    limit $1
  `, [limit]);
  return rows.map(mapAlertRow);
}

export async function getAlertById(id: string, organizationId?: string): Promise<AlertView | null> {
  const fallback = fixtureAlerts().find((alert) => alert.id === id) || null;
  if (!databaseConfigured()) return fallback;
  const pool = getPool();
  const alertJoin = organizationId ? "join alerts a on a.change_id = dc.id" : "left join alerts a on a.change_id = dc.id";
  const orgFilter = organizationId ? "and a.organization_id = $2::uuid" : "";
  const { rows } = await pool.query(`
    select dc.id::text, dc.severity, dc.topics, dc.diff_excerpt, dc.summary_json, dc.status,
      dc.needs_human_review, dc.created_at, s.name as source_name, s.agency, s.url,
      ss.fetch_metadata,
      case
        when count(ad.id) = 0 then 'not_sent'
        when bool_or(ad.status = 'failed') then 'failed'
        when bool_or(ad.status = 'queued_missing_resend_key') then 'queued_missing_resend_key'
        when bool_or(ad.status = 'queued') then 'queued'
        when bool_or(ad.status = 'digest_pending') then 'digest_pending'
        when bool_and(ad.status = 'sent') then 'sent'
        else max(ad.status)
      end as delivery_status
    from detected_changes dc
    join sources s on s.id = dc.source_id
    left join source_snapshots ss on ss.id = dc.current_snapshot_id
    ${alertJoin}
    left join alert_deliveries ad on ad.alert_id = a.id
    where dc.id = $1
      ${orgFilter}
    group by dc.id, s.id, ss.id
  `, organizationId ? [id, organizationId] : [id]);
  return rows[0] ? mapAlertRow(rows[0]) : null;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  if (!databaseConfigured()) {
    return {
      sources: seedSources.length,
      enabledSources: seedSources.filter((source) => source.enabled).length,
      reviewQueue: fixtureAlerts().filter((alert) => alert.needs_human_review).length,
      organizations: 1,
      sentAlerts: fixtureAlerts().filter((alert) => alert.status === "sent").length,
      queuedDeliveries: fixtureAlerts().filter((alert) => alert.status === "approved").length,
      failedDeliveries: 0
    };
  }
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      (select count(*)::int from sources) as sources,
      (select count(*)::int from sources where enabled = true) as enabled_sources,
      (select count(*)::int from detected_changes where needs_human_review = true and status in ('draft', 'review_required')) as review_queue,
      (select count(*)::int from organizations) as organizations,
      (select count(*)::int from alerts where status = 'sent') as sent_alerts,
      (select count(*)::int from alert_deliveries where status in ('queued', 'queued_missing_resend_key', 'digest_pending')) as queued_deliveries,
      (select count(*)::int from alert_deliveries where status = 'failed') as failed_deliveries
  `);
  return {
    sources: rows[0]?.sources || 0,
    enabledSources: rows[0]?.enabled_sources || 0,
    reviewQueue: rows[0]?.review_queue || 0,
    organizations: rows[0]?.organizations || 0,
    sentAlerts: rows[0]?.sent_alerts || 0,
    queuedDeliveries: rows[0]?.queued_deliveries || 0,
    failedDeliveries: rows[0]?.failed_deliveries || 0
  };
}

export async function getWorkerHealth(staleAfterMinutes = Number(process.env.WORKER_STALE_AFTER_MINUTES || 90)): Promise<WorkerHealth> {
  const threshold = Number.isFinite(staleAfterMinutes) && staleAfterMinutes > 0 ? staleAfterMinutes : 90;
  if (!databaseConfigured()) {
    return {
      ok: false,
      enabledSources: seedSources.filter((source) => source.enabled).length,
      healthySources: 0,
      degradedSources: 0,
      staleSources: seedSources.filter((source) => source.enabled).length,
      scans24h: 0,
      failedScans24h: 0,
      lastScanAt: null,
      staleAfterMinutes: threshold
    };
  }

  const pool = getPool();
  const { rows } = await pool.query(`
    select
      (select count(*)::int from sources where enabled = true) as enabled_sources,
      (select count(*)::int from sources where enabled = true and health_status = 'ok' and last_checked_at >= now() - ($1 * interval '1 minute')) as healthy_sources,
      (select count(*)::int from sources where enabled = true and health_status = 'degraded') as degraded_sources,
      (select count(*)::int from sources where enabled = true and (last_checked_at is null or last_checked_at < now() - ($1 * interval '1 minute'))) as stale_sources,
      (select count(*)::int from source_runs where finished_at >= now() - interval '24 hours') as scans_24h,
      (select count(*)::int from source_runs where finished_at >= now() - interval '24 hours' and status = 'failed') as failed_scans_24h,
      (select max(finished_at) from source_runs) as last_scan_at
  `, [threshold]);
  const row = rows[0] || {};
  const enabledSources = row.enabled_sources || 0;
  const degradedSources = row.degraded_sources || 0;
  const staleSources = row.stale_sources || 0;
  return {
    ok: enabledSources > 0 && degradedSources === 0 && staleSources === 0,
    enabledSources,
    healthySources: row.healthy_sources || 0,
    degradedSources,
    staleSources,
    scans24h: row.scans_24h || 0,
    failedScans24h: row.failed_scans_24h || 0,
    lastScanAt: row.last_scan_at ? new Date(row.last_scan_at).toISOString() : null,
    staleAfterMinutes: threshold
  };
}

export async function listNotificationRecipients(organizationId?: string, deliverableOnly = false): Promise<NotificationRecipientView[]> {
  if (!databaseConfigured()) {
    return [{
      id: "fixture-recipient",
      organizationId: "fixture-org",
      recipientEmail: "payroll@example.se",
      immediate: true,
      dailyDigest: true,
      topics: []
    }];
  }
  const pool = getPool();
  const { rows } = await pool.query(`
    select id::text, organization_id::text, recipient_email, immediate, daily_digest, topics
    from notification_settings
    where unsubscribed_at is null
      and ($1::uuid is null or organization_id = $1::uuid)
      and (
        $2::boolean = false
        or exists (
          select 1 from subscriptions
          where subscriptions.organization_id = notification_settings.organization_id
            and subscriptions.status in ('trialing', 'active', 'cancel_at_period_end')
        )
      )
    order by created_at asc
  `, [organizationId || null, deliverableOnly]);
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    recipientEmail: row.recipient_email,
    immediate: row.immediate,
    dailyDigest: row.daily_digest,
    topics: Array.isArray(row.topics) ? row.topics : []
  }));
}

export async function createBetaWorkspace(input: { organizationName: string; email: string; name?: string; passwordHash?: string; planId?: string }) {
  const config = loadConfig();
  if (!config.DATABASE_URL) return { mode: "fixture" as const, organizationId: "fixture-org", userId: "fixture-user" };
  const planId = normalizePlanId(input.planId);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const user = await client.query(`
      insert into users (email, name, password_hash)
      values ($1, $2, $3)
      returning id::text
    `, [input.email.toLowerCase(), input.name || null, input.passwordHash || null]);
    const org = await client.query(`
      insert into organizations (name, billing_email, trial_ends_at)
      values ($1, $2, now() + interval '14 days')
      returning id::text
    `, [input.organizationName, input.email.toLowerCase()]);
    await client.query(`
      insert into organization_members (organization_id, user_id, role)
      values ($1, $2, 'owner')
      on conflict (organization_id, user_id) do nothing
    `, [org.rows[0].id, user.rows[0].id]);
    await client.query(`
      insert into subscriptions (organization_id, plan_id, status)
      values ($1, $2, 'signup_started')
      on conflict (organization_id) do update set plan_id = excluded.plan_id, updated_at = now()
    `, [org.rows[0].id, planId]);
    await client.query(`
      insert into notification_settings (organization_id, recipient_email, immediate, daily_digest, topics)
      values ($1, $2, true, true, '[]'::jsonb)
    `, [org.rows[0].id, input.email.toLowerCase()]);
    await client.query("commit");
    return { mode: "database" as const, organizationId: org.rows[0].id, userId: user.rows[0].id };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getSubscriptionForOrganization(organizationId?: string | null): Promise<SubscriptionView | null> {
  if (!databaseConfigured() || !organizationId) return null;
  const pool = getPool();
  const { rows } = await pool.query(`
    select organization_id::text, plan_id, status, stripe_customer_id, stripe_subscription_id, current_period_end
    from subscriptions
    where organization_id = $1
    order by updated_at desc
    limit 1
  `, [organizationId]);
  return rows[0] ? mapSubscriptionRow(rows[0]) : null;
}

export async function markCheckoutStarted(input: { organizationId: string; planId: string; stripeCustomerId: string }) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  await pool.query(`
    insert into subscriptions (organization_id, plan_id, stripe_customer_id, status)
    values ($1, $2, $3, 'checkout_started')
    on conflict (organization_id) do update set
      plan_id = excluded.plan_id,
      stripe_customer_id = excluded.stripe_customer_id,
      status = excluded.status,
      updated_at = now()
  `, [input.organizationId, normalizePlanId(input.planId), input.stripeCustomerId]);
  return { mode: "database" as const };
}

export async function syncStripeSubscription(input: SubscriptionSyncInput) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const organizationId = input.organizationId || await findOrganizationForStripe(input);
  if (!organizationId) return { mode: "missing_organization" as const };
  const pool = getPool();
  await pool.query(`
    insert into subscriptions (
      organization_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end
    )
    values ($1, $2, $3, $4, $5, $6)
    on conflict (organization_id) do update set
      plan_id = excluded.plan_id,
      stripe_customer_id = coalesce(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, subscriptions.stripe_subscription_id),
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = now()
  `, [
    organizationId,
    normalizePlanId(input.planId),
    input.stripeCustomerId || null,
    input.stripeSubscriptionId || null,
    input.status,
    input.currentPeriodEnd || null
  ]);
  return { mode: "database" as const, organizationId };
}

export async function createSource(input: { name: string; agency: string; url: string; strategy: FetchStrategy; topics: string[]; priority?: string; enabled?: boolean; requiresReviewByDefault?: boolean }) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const { rows } = await pool.query(`
    insert into sources (name, agency, url, strategy, topics, enabled, priority, requires_review_by_default)
    values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
    on conflict (url) do update set
      name = excluded.name,
      agency = excluded.agency,
      strategy = excluded.strategy,
      topics = excluded.topics,
      enabled = excluded.enabled,
      priority = excluded.priority,
      requires_review_by_default = excluded.requires_review_by_default,
      updated_at = now()
    returning id::text
  `, [
    input.name,
    input.agency,
    input.url,
    input.strategy,
    JSON.stringify(input.topics),
    input.enabled ?? true,
    input.priority || "medium",
    input.requiresReviewByDefault ?? true
  ]);
  return { mode: "database" as const, sourceId: rows[0].id as string };
}

export async function updateNotificationSettings(input: { organizationId?: string; recipientId?: string; recipientEmail: string; immediate: boolean; dailyDigest: boolean; topics?: string[] }) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const organizationId = input.organizationId || await getDefaultOrganizationId();
  if (!organizationId) throw new Error("Create an organization before saving notification settings.");
  if (input.recipientId) {
    await pool.query(`
      update notification_settings
      set recipient_email = $3,
        immediate = $4,
        daily_digest = $5,
        topics = $6::jsonb,
        unsubscribed_at = null,
        updated_at = now()
      where id = $1::uuid and organization_id = $2::uuid
    `, [input.recipientId, organizationId, input.recipientEmail.toLowerCase(), input.immediate, input.dailyDigest, JSON.stringify(input.topics || [])]);
    return { mode: "database" as const };
  }
  await pool.query(`
    insert into notification_settings (organization_id, recipient_email, immediate, daily_digest, topics)
    values ($1, $2, $3, $4, $5::jsonb)
    on conflict (organization_id, recipient_email) do update set
      immediate = excluded.immediate,
      daily_digest = excluded.daily_digest,
      topics = excluded.topics,
      unsubscribed_at = null,
      updated_at = now()
  `, [organizationId, input.recipientEmail.toLowerCase(), input.immediate, input.dailyDigest, JSON.stringify(input.topics || [])]);
  return { mode: "database" as const };
}

export async function startSourceRun(sourceId: string) {
  if (!databaseConfigured()) return null;
  const pool = getPool();
  const { rows } = await pool.query(`
    insert into source_runs (source_id, status)
    values ($1, 'running')
    returning id::text
  `, [sourceId]);
  return rows[0].id as string;
}

export async function finishSourceRun(input: { runId: string | null; sourceId: string; status: "success" | "failed"; error?: string; metadata?: Record<string, unknown> }) {
  if (!databaseConfigured() || !input.runId) return;
  const pool = getPool();
  await pool.query(`
    update source_runs
    set status = $2, finished_at = now(), error = $3, metadata = $4::jsonb
    where id = $1
  `, [input.runId, input.status, input.error || null, JSON.stringify(input.metadata || {})]);
  await pool.query(`
    update sources
    set health_status = $2, last_checked_at = now(), updated_at = now()
    where id = $1
  `, [input.sourceId, input.status === "success" ? "ok" : "degraded"]);
}

export async function getLatestSnapshot(sourceId: string): Promise<(ContentSnapshot & { snapshotId: string }) | undefined> {
  if (!databaseConfigured()) return undefined;
  const pool = getPool();
  const { rows } = await pool.query(`
    select id::text, source_id::text, content_hash, normalized_text, page_hashes, fetch_metadata
    from source_snapshots
    where source_id = $1
    order by created_at desc
    limit 1
  `, [sourceId]);
  const row = rows[0];
  if (!row) return undefined;
  return {
    snapshotId: row.id,
    sourceId: row.source_id,
    normalizedText: row.normalized_text,
    contentHash: row.content_hash,
    pageHashes: row.page_hashes || {},
    metadata: row.fetch_metadata
  };
}

export async function saveSnapshot(snapshot: ContentSnapshot, runId: string | null): Promise<string | null> {
  if (!databaseConfigured()) return null;
  const pool = getPool();
  const { rows } = await pool.query(`
    insert into source_snapshots (source_id, run_id, content_hash, normalized_text, page_hashes, fetch_metadata)
    values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    on conflict (source_id, content_hash) do update set run_id = coalesce(excluded.run_id, source_snapshots.run_id)
    returning id::text
  `, [
    snapshot.sourceId,
    runId,
    snapshot.contentHash,
    snapshot.normalizedText,
    JSON.stringify(snapshot.pageHashes || {}),
    JSON.stringify(snapshot.metadata)
  ]);
  return rows[0].id as string;
}

export async function saveDetectedChange(input: { sourceId: string; previousSnapshotId?: string; currentSnapshotId: string | null; change: DetectedChangeDraft; summary: SummaryResult }) {
  if (!databaseConfigured() || !input.currentSnapshotId) return null;
  const pool = getPool();
  const status: AlertStatus = input.change.needsHumanReview || input.summary.needs_human_review ? "review_required" : "approved";
  const key = idempotencyKey(input.sourceId, input.change.previousHash, input.change.currentHash);
  const { rows } = await pool.query(`
    insert into detected_changes (
      source_id, previous_snapshot_id, current_snapshot_id, severity, topics, diff_excerpt,
      changed_ratio, summary_json, status, needs_human_review, reason_codes, idempotency_key
    )
    values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10, $11::jsonb, $12)
    on conflict (idempotency_key) do update set
      summary_json = excluded.summary_json,
      status = detected_changes.status
    returning id::text, status
  `, [
    input.sourceId,
    input.previousSnapshotId || null,
    input.currentSnapshotId,
    input.summary.severity,
    JSON.stringify(input.summary.topics),
    input.change.diffExcerpt,
    String(input.change.changedRatio),
    JSON.stringify(input.summary),
    status,
    status === "review_required",
    JSON.stringify(input.change.reasonCodes),
    key
  ]);
  if (status === "approved") await createAlertDrafts(rows[0].id);
  return rows[0] as { id: string; status: AlertStatus };
}

export async function reviewChange(changeId: string, decision: "approved" | "suppressed", note?: string) {
  if (!databaseConfigured()) return { mode: "fixture" as const, changeId, decision };
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`
      update detected_changes
      set status = $2, needs_human_review = false
      where id = $1
    `, [changeId, decision]);
    await client.query(`
      insert into change_reviews (change_id, decision, note)
      values ($1, $2, $3)
    `, [changeId, decision, note || null]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  if (decision === "approved") await createAlertDrafts(changeId);
  return { mode: "database" as const, changeId, decision };
}

export async function deliverApprovedAlerts(limit = Number(process.env.ALERT_DELIVERY_LIMIT || 25)): Promise<DeliveryRunResult> {
  const result: DeliveryRunResult = { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  if (!databaseConfigured()) return result;

  const config = loadConfig();
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      ad.id::text as delivery_id,
      ad.recipient_email,
      a.id::text as alert_id,
      a.subject,
      a.html_body,
      a.text_body
    from alert_deliveries ad
    join alerts a on a.id = ad.alert_id
    join detected_changes dc on dc.id = a.change_id
    where a.status = 'approved'
      and dc.status = 'approved'
      and ad.status in ('queued', 'queued_missing_resend_key', 'failed')
    order by ad.created_at asc
    limit $1
  `, [limit]);

  for (const row of rows) {
    result.attempted += 1;
    try {
      if (!config.RESEND_API_KEY) {
        await pool.query(`
          update alert_deliveries
          set status = 'queued_missing_resend_key', error = 'RESEND_API_KEY is not configured.'
          where id = $1
        `, [row.delivery_id]);
        result.skipped += 1;
        continue;
      }

      const sent = await sendEmail({
        to: row.recipient_email,
        subject: row.subject,
        html: row.html_body,
        text: row.text_body
      });
      await pool.query(`
        update alert_deliveries
        set status = 'sent', provider_message_id = $2, error = null
        where id = $1
      `, [row.delivery_id, sent.id]);
      await pool.query(`
        update alerts
        set status = 'sent', sent_at = coalesce(sent_at, now())
        where id = $1
          and not exists (
            select 1 from alert_deliveries
            where alert_id = $1 and status <> 'sent'
          )
      `, [row.alert_id]);
      result.sent += 1;
    } catch (error) {
      await pool.query(`
        update alert_deliveries
        set status = 'failed', error = $2
        where id = $1
      `, [row.delivery_id, error instanceof Error ? error.message : String(error)]);
      result.failed += 1;
    }
  }

  return result;
}

export async function deliverDailyDigests(options: DailyDigestOptions = {}): Promise<DeliveryRunResult> {
  const result: DeliveryRunResult = { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  if (!databaseConfigured()) return result;

  const { date, hour } = stockholmDigestClock(options.now || new Date());
  if (!options.force && hour < 7) return result;

  const config = loadConfig();
  const pool = getPool();
  const configuredLimit = Number(process.env.DIGEST_DELIVERY_LIMIT || 25);
  const limit = options.limit && options.limit > 0 ? options.limit : Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 25;
  const { rows } = await pool.query(`
    select
      a.organization_id::text,
      ad.recipient_email,
      array_agg(ad.id::text order by ad.created_at) as delivery_ids,
      json_agg(dc.summary_json order by dc.created_at) as summaries
    from alert_deliveries ad
    join alerts a on a.id = ad.alert_id
    join detected_changes dc on dc.id = a.change_id
    where a.status = 'approved'
      and dc.status = 'approved'
      and ad.status = 'digest_pending'
    group by a.organization_id, ad.recipient_email
    order by min(ad.created_at)
    limit $1
  `, [limit]);

  for (const row of rows) {
    result.attempted += 1;
    if (!config.RESEND_API_KEY) {
      result.skipped += 1;
      continue;
    }

    const claim = await pool.query(`
      insert into digest_delivery_runs (organization_id, recipient_email, digest_date, status)
      values ($1, $2, $3::date, 'processing')
      on conflict (organization_id, recipient_email, digest_date) do update set
        status = 'processing',
        error = null,
        started_at = now(),
        updated_at = now()
      where digest_delivery_runs.status = 'failed'
         or (digest_delivery_runs.status = 'processing' and digest_delivery_runs.updated_at < now() - interval '15 minutes')
      returning id::text
    `, [row.organization_id, row.recipient_email, date]);
    const runId = claim.rows[0]?.id as string | undefined;
    if (!runId) {
      result.skipped += 1;
      continue;
    }

    const deliveryIds = (row.delivery_ids || []) as string[];
    const summaries = (row.summaries || []) as SummaryResult[];
    try {
      const email = renderDailyDigestEmail(summaries, `${config.APP_URL}/app/settings`);
      const sent = await sendEmail({ to: row.recipient_email, ...email });
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`
          update alert_deliveries
          set status = 'sent', provider_message_id = $2, error = null
          where id = any($1::uuid[]) and status = 'digest_pending'
        `, [deliveryIds, sent.id]);
        await client.query(`
          update alerts a
          set status = 'sent', sent_at = coalesce(sent_at, now())
          where a.id in (select alert_id from alert_deliveries where id = any($1::uuid[]))
            and not exists (select 1 from alert_deliveries pending where pending.alert_id = a.id and pending.status <> 'sent')
        `, [deliveryIds]);
        await client.query(`
          update digest_delivery_runs
          set status = 'sent', item_count = $2, provider_message_id = $3, error = null, finished_at = now(), updated_at = now()
          where id = $1
        `, [runId, summaries.length, sent.id]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      result.sent += 1;
    } catch (error) {
      await pool.query(`
        update digest_delivery_runs
        set status = 'failed', error = $2, finished_at = now(), updated_at = now()
        where id = $1
      `, [runId, error instanceof Error ? error.message : String(error)]);
      result.failed += 1;
    }
  }

  return result;
}

async function createAlertDrafts(changeId: string) {
  const pool = getPool();
  const alert = await getAlertById(changeId);
  if (!alert) return;
  const recipients = await listNotificationRecipients(undefined, true);
  const activeRecipients = recipients.filter((recipient) => (recipient.immediate || recipient.dailyDigest) && matchesTopics(recipient.topics, alert.topics));
  for (const recipient of activeRecipients) {
    const email = renderAlertEmail({
      summary: alert,
      diffExcerpt: alert.diffExcerpt,
      manageUrl: `${loadConfig().APP_URL}/app/settings`
    });
    const { rows } = await pool.query(`
      insert into alerts (organization_id, change_id, status, subject, html_body, text_body)
      values ($1, $2, 'approved', $3, $4, $5)
      on conflict (organization_id, change_id) do update set
        subject = excluded.subject,
        html_body = excluded.html_body,
        text_body = excluded.text_body
      returning id::text
    `, [recipient.organizationId, changeId, email.subject, email.html, email.text]);
    const deliveryStatus = recipient.immediate ? "queued" : "digest_pending";
    await pool.query(`
      insert into alert_deliveries (alert_id, recipient_email, provider, status)
      values ($1, $2, 'resend', $3)
      on conflict (alert_id, recipient_email) do nothing
    `, [rows[0].id, recipient.recipientEmail, deliveryStatus]);
  }
}

export async function getUserAuthProfileByEmail(email: string): Promise<UserAuthProfile | null> {
  if (!databaseConfigured()) return null;
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      u.id::text as user_id,
      u.email,
      u.name,
      u.password_hash,
      u.is_platform_admin,
      om.organization_id::text,
      om.role
    from users u
    left join organization_members om on om.user_id = u.id
    where lower(u.email) = lower($1)
    order by
      case om.role when 'owner' then 1 when 'admin' then 2 when 'member' then 3 else 4 end,
      om.created_at asc
    limit 1
  `, [email]);
  return rows[0] ? mapUserAuthProfile(rows[0]) : null;
}

export async function getUserAuthProfileById(userId: string): Promise<UserAuthProfile | null> {
  if (!databaseConfigured()) return null;
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      u.id::text as user_id,
      u.email,
      u.name,
      u.password_hash,
      u.is_platform_admin,
      om.organization_id::text,
      om.role
    from users u
    left join organization_members om on om.user_id = u.id
    where u.id = $1
    order by
      case om.role when 'owner' then 1 when 'admin' then 2 when 'member' then 3 else 4 end,
      om.created_at asc
    limit 1
  `, [userId]);
  return rows[0] ? mapUserAuthProfile(rows[0]) : null;
}

async function getDefaultOrganizationId(): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query("select id::text from organizations order by created_at asc limit 1");
  return rows[0]?.id || null;
}

async function findOrganizationForStripe(input: Pick<SubscriptionSyncInput, "stripeCustomerId" | "stripeSubscriptionId">) {
  const pool = getPool();
  const { rows } = await pool.query(`
    select organization_id::text
    from subscriptions
    where ($1::text is not null and stripe_customer_id = $1)
       or ($2::text is not null and stripe_subscription_id = $2)
    order by updated_at desc
    limit 1
  `, [input.stripeCustomerId || null, input.stripeSubscriptionId || null]);
  return rows[0]?.organization_id || null;
}

function mapSourceRow(row: any): SourceView {
  return {
    id: row.id,
    name: row.name,
    agency: row.agency,
    url: row.url,
    strategy: row.strategy as FetchStrategy,
    topics: Array.isArray(row.topics) ? row.topics : [],
    enabled: row.enabled,
    priority: row.priority || "core",
    requiresReviewByDefault: row.requires_review_by_default,
    healthStatus: row.health_status,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null
  };
}

function mapAlertRow(row: any): AlertView {
  const summary = normalizeSummary(row.summary_json, row);
  const fetchMetadata = row.fetch_metadata || {};
  return {
    ...summary,
    id: row.id,
    agency: row.agency,
    title: titleFromSummary(summary),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    diffExcerpt: row.diff_excerpt,
    sourceTitle: fetchMetadata.title,
    deliveryStatus: row.delivery_status
  };
}

function normalizeSummary(summary: any, row: any): SummaryResult {
  const fallbackSeverity = (row.severity || "medium") as Severity;
  return {
    source_name: summary?.source_name || row.source_name || row.agency,
    source_url: summary?.source_url || row.url,
    change_type: summary?.change_type || "unknown",
    topics: Array.isArray(summary?.topics) ? summary.topics : Array.isArray(row.topics) ? row.topics : [],
    severity: summary?.severity || fallbackSeverity,
    confidence: typeof summary?.confidence === "number" ? summary.confidence : 0,
    summary_plain_english: summary?.summary_plain_english || "A source change was detected and needs review.",
    who_is_affected: summary?.who_is_affected || "Subscribed payroll and accounting teams.",
    recommended_action: summary?.recommended_action || "Open the official source and review the changed excerpt.",
    needs_human_review: Boolean(summary?.needs_human_review ?? row.needs_human_review),
    evidence_excerpts: Array.isArray(summary?.evidence_excerpts) && summary.evidence_excerpts.length ? summary.evidence_excerpts : [row.diff_excerpt || "No excerpt stored."]
  };
}

function titleFromSummary(summary: SummaryResult) {
  const topic = summary.topics[0]?.replace(/_/g, " ") || summary.change_type.replace(/_/g, " ");
  return `${summary.source_name}: ${topic}`;
}

function fixtureAlerts(): AlertView[] {
  return sampleSummaries
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .map((summary) => ({
      ...summary,
      status: summary.status,
      diffExcerpt: summary.evidence_excerpts.join("\n"),
      sourceTitle: summary.title,
      deliveryStatus: summary.status === "sent" ? "delivered" : "not_sent"
    }));
}

function matchesTopics(recipientTopics: string[], alertTopics: string[]) {
  if (recipientTopics.length === 0) return true;
  return recipientTopics.some((topic) => alertTopics.includes(topic));
}

export function stockholmDigestClock(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour)
  };
}

function normalizePlanId(planId?: string | null) {
  return planId === "solo" || planId === "multi_office" || planId === "team" ? planId : "team";
}

function mapSubscriptionRow(row: any): SubscriptionView {
  return {
    organizationId: row.organization_id,
    planId: row.plan_id,
    status: row.status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null
  };
}

function mapUserAuthProfile(row: any): UserAuthProfile {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    isPlatformAdmin: Boolean(row.is_platform_admin),
    organizationId: row.organization_id,
    role: row.role
  };
}
