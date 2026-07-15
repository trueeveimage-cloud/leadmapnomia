import { logger } from "@ruleradar/shared";
import { runOnce } from "./run-once";

const intervalMs = positiveNumber(process.env.WORKER_INTERVAL_MS, 30 * 60 * 1000);
const retryBaseMs = positiveNumber(process.env.WORKER_RETRY_BASE_MS, 60 * 1000);

async function loop() {
  logger.info("worker_started", { intervalMs });
  let consecutiveFailures = 0;
  while (true) {
    let delayMs = intervalMs;
    try {
      const result = await runOnce();
      consecutiveFailures = 0;
      logger.info("scan_run_complete", { result });
    } catch (error) {
      consecutiveFailures += 1;
      delayMs = Math.min(intervalMs, retryBaseMs * 2 ** Math.min(consecutiveFailures - 1, 5));
      logger.error("scan_run_failed", {
        consecutiveFailures,
        retryInMs: delayMs,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

loop().catch((error) => {
  logger.error("worker_fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
