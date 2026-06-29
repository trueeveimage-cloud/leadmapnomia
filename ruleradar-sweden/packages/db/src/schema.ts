import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const fetchStrategyEnum = pgEnum("fetch_strategy", ["html", "news_index", "pdf", "document_page", "browser_fallback"]);
export const alertStatusEnum = pgEnum("alert_status", ["draft", "review_required", "approved", "sent", "suppressed", "archived"]);
export const roleEnum = pgEnum("org_role", ["owner", "member", "admin"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  isPlatformAdmin: boolean("is_platform_admin").default(false).notNull(),
  ...timestamps
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  billingEmail: text("billing_email"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  ...timestamps
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  role: roleEnum("role").default("member").notNull(),
  ...timestamps
}, (table) => ({
  userOrgUnique: uniqueIndex("organization_members_user_org_unique").on(table.organizationId, table.userId)
}));

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  monthlySek: integer("monthly_sek").notNull(),
  includedSeats: integer("included_seats").notNull(),
  features: jsonb("features").default({}).notNull(),
  ...timestamps
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  planId: text("plan_id").references(() => plans.id).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  ...timestamps
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  agency: text("agency").notNull(),
  url: text("url").notNull(),
  strategy: fetchStrategyEnum("strategy").notNull(),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  priority: text("priority").default("core").notNull(),
  requiresReviewByDefault: boolean("requires_review_by_default").default(false).notNull(),
  healthStatus: text("health_status").default("unknown").notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  sourceUrlUnique: uniqueIndex("sources_url_unique").on(table.url)
}));

export const sourceRuns = pgTable("source_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => sources.id).notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  metadata: jsonb("metadata").default({}).notNull()
}, (table) => ({
  sourceRunSourceIdx: index("source_runs_source_idx").on(table.sourceId)
}));

export const sourceSnapshots = pgTable("source_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => sources.id).notNull(),
  runId: uuid("run_id").references(() => sourceRuns.id),
  contentHash: text("content_hash").notNull(),
  normalizedText: text("normalized_text").notNull(),
  pageHashes: jsonb("page_hashes").$type<Record<string, string>>().default({}).notNull(),
  fetchMetadata: jsonb("fetch_metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  sourceSnapshotHashUnique: uniqueIndex("source_snapshots_source_hash_unique").on(table.sourceId, table.contentHash),
  sourceSnapshotSourceIdx: index("source_snapshots_source_idx").on(table.sourceId)
}));

export const detectedChanges = pgTable("detected_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => sources.id).notNull(),
  previousSnapshotId: uuid("previous_snapshot_id"),
  currentSnapshotId: uuid("current_snapshot_id").references(() => sourceSnapshots.id),
  severity: severityEnum("severity").notNull(),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  diffExcerpt: text("diff_excerpt").notNull(),
  changedRatio: numeric("changed_ratio").notNull(),
  summaryJson: jsonb("summary_json").default({}).notNull(),
  status: alertStatusEnum("status").default("draft").notNull(),
  needsHumanReview: boolean("needs_human_review").default(false).notNull(),
  reasonCodes: jsonb("reason_codes").$type<string[]>().default([]).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  changeIdempotencyUnique: uniqueIndex("detected_changes_idempotency_unique").on(table.idempotencyKey),
  changeSourceIdx: index("detected_changes_source_idx").on(table.sourceId)
}));

export const changeReviews = pgTable("change_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  changeId: uuid("change_id").references(() => detectedChanges.id).notNull(),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
  decision: text("decision").notNull(),
  editedSummaryJson: jsonb("edited_summary_json"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  changeId: uuid("change_id").references(() => detectedChanges.id).notNull(),
  status: alertStatusEnum("status").default("draft").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  alertOrgIdx: index("alerts_org_idx").on(table.organizationId)
}));

export const alertDeliveries = pgTable("alert_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").references(() => alerts.id).notNull(),
  recipientEmail: text("recipient_email").notNull(),
  provider: text("provider").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const notificationSettings = pgTable("notification_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  recipientEmail: text("recipient_email").notNull(),
  immediate: boolean("immediate").default(true).notNull(),
  dailyDigest: boolean("daily_digest").default(true).notNull(),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  ...timestamps
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const systemTokens = pgTable("api_keys_or_system_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
