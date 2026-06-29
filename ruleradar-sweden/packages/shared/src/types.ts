export type Severity = "low" | "medium" | "high" | "critical";
export type FetchStrategy = "html" | "news_index" | "pdf" | "document_page" | "browser_fallback";
export type AlertStatus = "draft" | "review_required" | "approved" | "sent" | "suppressed" | "archived";
export type OrgRole = "owner" | "member" | "admin";

export interface MonitoredSource {
  id: string;
  name: string;
  agency: string;
  url: string;
  strategy: FetchStrategy;
  topics: string[];
  enabled: boolean;
  priority: "core" | "high" | "medium" | "optional";
  requiresReviewByDefault?: boolean;
}

export interface FetchMetadata {
  url: string;
  finalUrl: string;
  title?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
  status: number;
}

export interface ContentSnapshot {
  sourceId: string;
  normalizedText: string;
  contentHash: string;
  pageHashes?: Record<string, string>;
  metadata: FetchMetadata;
}

export interface DetectedChangeDraft {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  previousHash?: string;
  currentHash: string;
  diffExcerpt: string;
  changedRatio: number;
  severity: Severity;
  topics: string[];
  needsHumanReview: boolean;
  reasonCodes: string[];
}

export interface SummaryResult {
  source_name: string;
  source_url: string;
  change_type: "rule_update" | "form_update" | "deadline_update" | "fee_update" | "news_update" | "unknown";
  topics: string[];
  severity: Severity;
  confidence: number;
  summary_plain_english: string;
  who_is_affected: string;
  recommended_action: string;
  needs_human_review: boolean;
  evidence_excerpts: string[];
}
