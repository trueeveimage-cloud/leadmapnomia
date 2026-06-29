import { databaseConfigured, finishSourceRun, getLatestSnapshot, listEnabledSources, saveDetectedChange, saveSnapshot, startSourceRun } from "@ruleradar/db";
import { summarizeChange } from "@ruleradar/ai";
import { renderAlertEmail } from "@ruleradar/notifications";
import { scanSource } from "@ruleradar/monitoring";
import { logger, type ContentSnapshot } from "@ruleradar/shared";

const previousBySource = new Map<string, ContentSnapshot>();

export async function runOnce() {
  const enabledSources = await listEnabledSources(Number(process.env.SCAN_LIMIT || 5));
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
      const previousSnapshotId = previousSnapshot && "snapshotId" in previousSnapshot && typeof previousSnapshot.snapshotId === "string"
        ? previousSnapshot.snapshotId
        : undefined;
      const persisted = await saveDetectedChange({
        sourceId: source.id,
        previousSnapshotId,
        currentSnapshotId: snapshotId,
        change: result.change,
        summary
      });
      const email = renderAlertEmail({
        summary,
        diffExcerpt: result.change.diffExcerpt,
        manageUrl: `${process.env.APP_URL || "http://localhost:3000"}/app/settings`
      });
      logger.info("change_detected", {
        source: source.id,
        changeId: persisted?.id || null,
        severity: summary.severity,
        review: summary.needs_human_review,
        status: persisted?.status || "fixture",
        subject: email.subject
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

  return { sources: enabledSources.length, baselined, changes, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOnce().then((result) => {
    logger.info("scan_run_complete", result);
  });
}
