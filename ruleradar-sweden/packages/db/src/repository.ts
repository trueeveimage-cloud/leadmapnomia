import { getPool } from "./client";
import { sampleSummaries, seedSources, severityRank } from "./fixtures";
import { idempotencyKey, loadConfig, type AlertStatus, type ContentSnapshot, type DetectedChangeDraft, type FetchStrategy, type MonitoredSource, type Severity, type SummaryResult } from "@ruleradar/shared";
import { renderAlertEmail } from "@ruleradar/notifications/templates";

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
  reviewQueue: number;
  organizations: number;
  sentAlerts: number;
}

export interface NotificationRecipientView {
  id: string;
  organizationId: string;
  recipientEmail: string;
  immediate: boolean;
  dailyDigest: boolean;
  topics: string[];
}

export function databaseConfigured() {
  return Boolean(loadConfig().DATABASE_URL);
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

export async function listEnabledSources(limit = Number(process.env.SCAN_LIMIT || 5)): Promise<SourceView[]> {
  const sources = await listSources();
  return sources.filter((source) => source.enabled).slice(0, limit);
}

export async function listAlerts(limit = 50): Promise<AlertView[]> {
  if (!databaseConfigured()) return fixtureAlerts().slice(0, limit);
  const pool = getPool();
  const { rows } = await pool.query(`
    select dc.id::text, dc.severity, dc.topics, dc.diff_excerpt, dc.summary_json, dc.status,
      dc.needs_human_review, dc.created_at, s.name as source_name, s.agency, s.url,
      ss.fetch_metadata,
      coalesce(max(ad.status), 'not_sent') as delivery_status
    from detected_changes dc
    join sources s on s.id = dc.source_id
    left join source_snapshots ss on ss.id = dc.current_snapshot_id
    left join alerts a on a.change_id = dc.id
    left join alert_deliveries ad on ad.alert_id = a.id
    group by dc.id, s.id, ss.id
    order by dc.created_at desc
    limit $1
  `, [limit]);
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

export async function getAlertById(id: string): Promise<AlertView | null> {
  const fallback = fixtureAlerts().find((alert) => alert.id === id) || null;
  if (!databaseConfigured()) return fallback;
  const pool = getPool();
  const { rows } = await pool.query(`
    select dc.id::text, dc.severity, dc.topics, dc.diff_excerpt, dc.summary_json, dc.status,
      dc.needs_human_review, dc.created_at, s.name as source_name, s.agency, s.url,
      ss.fetch_metadata,
      coalesce(max(ad.status), 'not_sent') as delivery_status
    from detected_changes dc
    join sources s on s.id = dc.source_id
    left join source_snapshots ss on ss.id = dc.current_snapshot_id
    left join alerts a on a.change_id = dc.id
    left join alert_deliveries ad on ad.alert_id = a.id
    where dc.id = $1
    group by dc.id, s.id, ss.id
  `, [id]);
  return rows[0] ? mapAlertRow(rows[0]) : fallback;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  if (!databaseConfigured()) {
    return {
      sources: seedSources.length,
      reviewQueue: fixtureAlerts().filter((alert) => alert.needs_human_review).length,
      organizations: 1,
      sentAlerts: fixtureAlerts().filter((alert) => alert.status === "sent").length
    };
  }
  const pool = getPool();
  const { rows } = await pool.query(`
    select
      (select count(*)::int from sources) as sources,
      (select count(*)::int from detected_changes where needs_human_review = true and status in ('draft', 'review_required')) as review_queue,
      (select count(*)::int from organizations) as organizations,
      (select count(*)::int from alerts where status = 'sent') as sent_alerts
  `);
  return {
    sources: rows[0]?.sources || 0,
    reviewQueue: rows[0]?.review_queue || 0,
    organizations: rows[0]?.organizations || 0,
    sentAlerts: rows[0]?.sent_alerts || 0
  };
}

export async function listNotificationRecipients(): Promise<NotificationRecipientView[]> {
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
    order by created_at asc
  `);
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    recipientEmail: row.recipient_email,
    immediate: row.immediate,
    dailyDigest: row.daily_digest,
    topics: Array.isArray(row.topics) ? row.topics : []
  }));
}

export async function createBetaWorkspace(input: { organizationName: string; email: string; name?: string }) {
  const config = loadConfig();
  if (!config.DATABASE_URL) return { mode: "fixture" as const, organizationId: "fixture-org", userId: "fixture-user" };
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const user = await client.query(`
      insert into users (email, name)
      values ($1, $2)
      on conflict (email) do update set name = coalesce(excluded.name, users.name), updated_at = now()
      returning id::text
    `, [input.email.toLowerCase(), input.name || null]);
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
      values ($1, 'team', 'trialing')
    `, [org.rows[0].id]);
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

export async function updateNotificationSettings(input: { organizationId?: string; recipientEmail: string; immediate: boolean; dailyDigest: boolean; topics?: string[] }) {
  if (!databaseConfigured()) return { mode: "fixture" as const };
  const pool = getPool();
  const organizationId = input.organizationId || await getDefaultOrganizationId();
  if (!organizationId) throw new Error("Create an organization before saving notification settings.");
  await pool.query(`
    insert into notification_settings (organization_id, recipient_email, immediate, daily_digest, topics)
    values ($1, $2, $3, $4, $5::jsonb)
    on conflict do nothing
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

async function createAlertDrafts(changeId: string) {
  const pool = getPool();
  const alert = await getAlertById(changeId);
  if (!alert) return;
  const recipients = await listNotificationRecipients();
  const activeRecipients = recipients.filter((recipient) => recipient.immediate && matchesTopics(recipient.topics, alert.topics));
  for (const recipient of activeRecipients) {
    const email = renderAlertEmail({
      summary: alert,
      diffExcerpt: alert.diffExcerpt,
      manageUrl: `${loadConfig().APP_URL}/app/settings`
    });
    const { rows } = await pool.query(`
      insert into alerts (organization_id, change_id, status, subject, html_body, text_body)
      values ($1, $2, 'approved', $3, $4, $5)
      returning id::text
    `, [recipient.organizationId, changeId, email.subject, email.html, email.text]);
    await pool.query(`
      insert into alert_deliveries (alert_id, recipient_email, provider, status)
      values ($1, $2, 'resend', 'queued_for_manual_beta_send')
    `, [rows[0].id, recipient.recipientEmail]);
  }
}

async function getDefaultOrganizationId(): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query("select id::text from organizations order by created_at asc limit 1");
  return rows[0]?.id || null;
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
