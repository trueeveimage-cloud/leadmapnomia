import { logger } from "@ruleradar/shared";
import { runOnce } from "./run-once";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 30 * 60 * 1000);

async function loop() {
  logger.info("worker_started", { intervalMs });
  while (true) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

loop().catch((error) => {
  logger.error("worker_fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
