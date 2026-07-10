import type { NextRequest } from "next/server";

interface RateEntry {
  count: number;
  resetAt: number;
}

const globalRateStore = globalThis as typeof globalThis & { __ruleRadarRateStore?: Map<string, RateEntry> };
const rateStore = globalRateStore.__ruleRadarRateStore ?? new Map<string, RateEntry>();
globalRateStore.__ruleRadarRateStore = rateStore;

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).split(",")[0]!.trim().toLowerCase();
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export function isRateLimited(request: NextRequest, scope: string, limit: number, windowMs: number) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || request.headers.get("x-real-ip") || "unknown";
  const key = `${scope}:${client}`;
  const now = Date.now();
  const current = rateStore.get(key);

  if (!current || current.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs });
    pruneRateStore(now);
    return false;
  }

  current.count += 1;
  rateStore.set(key, current);
  return current.count > limit;
}

function pruneRateStore(now: number) {
  if (rateStore.size < 500) return;
  for (const [key, entry] of rateStore) {
    if (entry.resetAt <= now) rateStore.delete(key);
  }
}
