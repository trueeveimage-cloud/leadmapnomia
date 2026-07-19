import { pathToFileURL } from "node:url";
import { runScanPipeline } from "@ruleradar/monitoring";
import { runRetentionCleanup } from "@ruleradar/db";
import { logger } from "@ruleradar/shared";

export async function runOnce() {
  const result = await runScanPipeline();
  try {
    const cleanup = await runRetentionCleanup();
    logger.info("retention_cleanup_complete", { ...cleanup });
  } catch (error) {
    logger.error("retention_cleanup_failed", { error: error instanceof Error ? error.message : String(error) });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOnce().then((result) => {
    logger.info("scan_run_complete", { result });
  });
}
