import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ruleradar-worker",
    check: "worker heartbeats are stored in source_runs when DATABASE_URL is configured",
    time: new Date().toISOString()
  });
}
