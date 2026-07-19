import { NextResponse } from "next/server";
import { getMigrationStatus } from "@ruleradar/db";

export async function GET() {
  const database = await getMigrationStatus();
  return NextResponse.json({
    ok: database.ok,
    service: "ruleradar-web",
    database: { migrationsApplied: database.applied, migrationsExpected: database.expected },
    time: new Date().toISOString()
  }, {
    status: database.ok ? 200 : 503,
    headers: { "cache-control": "no-store" }
  });
}
