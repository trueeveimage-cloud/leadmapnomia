import { seedSources } from "@ruleradar/db";
import { fetchSourceSnapshot } from "@ruleradar/monitoring";

const sources = seedSources.filter((source) => source.enabled);
let failures = 0;

for (const source of sources) {
  const startedAt = Date.now();
  try {
    const snapshot = await fetchSourceSnapshot(source);
    if (snapshot.normalizedText.length < 200) throw new Error(`normalized content is too short (${snapshot.normalizedText.length} chars)`);
    process.stdout.write(`${JSON.stringify({
      status: "ok",
      source: source.id,
      agency: source.agency,
      chars: snapshot.normalizedText.length,
      durationMs: Date.now() - startedAt,
      title: snapshot.metadata.title || null
    })}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`${JSON.stringify({
      status: "failed",
      source: source.id,
      agency: source.agency,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    })}\n`);
  }
}

process.stdout.write(`${JSON.stringify({ status: failures === 0 ? "healthy" : "degraded", checked: sources.length, failures })}\n`);
if (failures > 0) process.exitCode = 1;
