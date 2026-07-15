import { NextResponse } from "next/server";
import { getWorkerHealth } from "@ruleradar/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await getWorkerHealth();
    return NextResponse.json({ ...health, service: "ruleradar-worker", time: new Date().toISOString() }, {
      status: health.ok ? 200 : 503,
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return NextResponse.json({ ok: false, service: "ruleradar-worker", reason: "health_check_failed", time: new Date().toISOString() }, {
      status: 503,
      headers: { "cache-control": "no-store" }
    });
  }
}
