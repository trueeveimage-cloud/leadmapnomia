import type { ContentSnapshot, DetectedChangeDraft, MonitoredSource } from "@ruleradar/shared";
import { buildLineDiff } from "./diff";
import { classifySeverity } from "./severity";
import { fetchSourceSnapshot } from "./fetcher";

export interface ScanResult {
  source: MonitoredSource;
  snapshot: ContentSnapshot;
  change?: DetectedChangeDraft;
}

export async function scanSource(source: MonitoredSource, previousSnapshot?: ContentSnapshot): Promise<ScanResult> {
  const snapshot = await fetchSourceSnapshot(source);
  if (!previousSnapshot || previousSnapshot.contentHash === snapshot.contentHash) {
    return { source, snapshot };
  }

  const diff = buildLineDiff(previousSnapshot.normalizedText, snapshot.normalizedText);
  const severity = classifySeverity(source, diff.excerpt, diff.changedRatio);
  const change: DetectedChangeDraft = {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    previousHash: previousSnapshot.contentHash,
    currentHash: snapshot.contentHash,
    diffExcerpt: diff.excerpt,
    changedRatio: diff.changedRatio,
    severity: severity.severity,
    topics: source.topics,
    needsHumanReview: severity.needsHumanReview,
    reasonCodes: severity.reasonCodes
  };

  return { source, snapshot, change };
}
