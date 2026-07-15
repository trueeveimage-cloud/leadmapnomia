import {
  databaseConfigured,
  deliverApprovedAlerts,
  deliverDailyDigests,
  finishSourceRun,
  getLatestSnapshot,
  listEnabledSources,
  saveDetectedChange,
  saveSnapshot,
  startSourceRun
} from "@ruleradar/db";
import { summarizeChange } from "@ruleradar/ai";
import { logger, type ContentSnapshot } from "@ruleradar/shared";
import { scanSource } from "./scanner";
import { applyReviewPolicy } from "./severity";

const previousBySource = new Map<string, ContentSnapshot>();

export interface ScanPipelineOptions {
  sourceLimit?: number;
  deliveryLimit?: number;
  deliverApproved?: boolean;
  deliverDigests?: boolean;
}

export interface ScanPipelineResult {
  sources: number;
  baselined: number;
  changes: number;
  failures: number;
  deliveries: {
    attempted: number;
    sent: number;
    skipped: number;
    failed: number;
  };
  digests: {
    attempted: number;
    sent: number;
    skipped: number;
    failed: number;
  };
}

export async function runScanPipeline(options: ScanPipelineOptions = {}): Promise<ScanPipelineResult> {
  const enabledSources = await listEnabledSources(options.sourceLimit ?? positiveInt(process.env.SCAN_LIMIT));
  let changes = 0;
  let baselined = 0;
  let failures = 0;

  for (const source of enabledSources) {
    const runId = await startSourceRun(source.id);
    try {
      const previousSnapshot = databaseConfigured()
        ? await getLatestSnapshot(source.id)
        : previousBySource.get(source.id);
      const result = await scanSource(source, previousSnapshot);
      const snapshotId = await saveSnapshot(result.snapshot, runId);
      if (!databaseConfigured()) previousBySource.set(source.id, result.snapshot);

      if (!result.change) {
        baselined += 1;
        logger.info("source_unchanged_or_baselined", { source: source.id, hash: result.snapshot.contentHash });
        await finishSourceRun({
          runId,
          sourceId: source.id,
          status: "success",
          metadata: { contentHash: result.snapshot.contentHash, changed: false, snapshotId }
        });
        continue;
      }

      changes += 1;
      const summary = await summarizeChange(result.change);
      const reviewedChange = applyReviewPolicy(result.change, summary.confidence);
      const summaryWithReviewPolicy = {
        ...summary,
        needs_human_review: summary.needs_human_review || reviewedChange.needsHumanReview
      };
      const previousSnapshotId = previousSnapshot && "snapshotId" in previousSnapshot && typeof previousSnapshot.snapshotId === "string"
        ? previousSnapshot.snapshotId
        : undefined;
      const persisted = await saveDetectedChange({
        sourceId: source.id,
        previousSnapshotId,
        currentSnapshotId: snapshotId,
        change: reviewedChange,
        summary: summaryWithReviewPolicy
      });

      logger.info("change_detected", {
        source: source.id,
        changeId: persisted?.id || null,
        severity: summaryWithReviewPolicy.severity,
        review: summaryWithReviewPolicy.needs_human_review,
        status: persisted?.status || "fixture"
      });
      await finishSourceRun({
        runId,
        sourceId: source.id,
        status: "success",
        metadata: { contentHash: result.snapshot.contentHash, changed: true, changeId: persisted?.id || null, snapshotId }
      });
    } catch (error) {
      failures += 1;
      logger.error("source_scan_failed", { source: source.id, error: error instanceof Error ? error.message : String(error) });
      await finishSourceRun({
        runId,
        sourceId: source.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const deliveries = options.deliverApproved === false
    ? { attempted: 0, sent: 0, skipped: 0, failed: 0 }
    : await deliverApprovedAlerts(options.deliveryLimit);
  const digests = options.deliverApproved === false || options.deliverDigests === false
    ? { attempted: 0, sent: 0, skipped: 0, failed: 0 }
    : await deliverDailyDigests({ limit: options.deliveryLimit });

  return { sources: enabledSources.length, baselined, changes, failures, deliveries, digests };
}

function positiveInt(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
