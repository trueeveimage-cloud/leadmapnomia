import { pathToFileURL } from "node:url";
import { runScanPipeline } from "@ruleradar/monitoring";
import { logger } from "@ruleradar/shared";

export async function runOnce() {
  return runScanPipeline();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOnce().then((result) => {
    logger.info("scan_run_complete", { result });
  });
}
