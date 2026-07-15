import { NextRequest, NextResponse } from "next/server";
import { runScanPipeline } from "@ruleradar/monitoring";
import { constantTimeEqual, loadConfig } from "@ruleradar/shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return runProtectedScan(request);
}

export async function POST(request: NextRequest) {
  return runProtectedScan(request);
}

async function runProtectedScan(request: NextRequest) {
  const config = loadConfig();
  if (!config.SYSTEM_CRON_SECRET) {
    return NextResponse.json({ error: "SYSTEM_CRON_SECRET is not configured." }, { status: 503 });
  }

  const providedSecret = readCronSecret(request);
  if (!providedSecret || !constantTimeEqual(providedSecret, config.SYSTEM_CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sourceLimit = positiveInt(request.nextUrl.searchParams.get("sourceLimit"));
  const deliveryLimit = positiveInt(request.nextUrl.searchParams.get("deliveryLimit"));
  const deliverApproved = request.nextUrl.searchParams.get("deliverApproved") !== "false";
  const deliverDigests = request.nextUrl.searchParams.get("deliverDigests") !== "false";
  const result = await runScanPipeline({ sourceLimit, deliveryLimit, deliverApproved, deliverDigests });

  return NextResponse.json({ ok: true, result, time: new Date().toISOString() });
}

function readCronSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret) return headerSecret;

  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1];

  return request.nextUrl.searchParams.get("secret") || "";
}

function positiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}
