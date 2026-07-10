import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isRateLimited, isSameOrigin } from "./request-guard";

describe("request guards", () => {
  it("accepts same-origin form requests and rejects cross-origin requests", () => {
    expect(isSameOrigin(new NextRequest("https://ruleradar.se/api/contact", { headers: { origin: "https://ruleradar.se" } }))).toBe(true);
    expect(isSameOrigin(new NextRequest("https://ruleradar.se/api/contact", { headers: { origin: "https://attacker.example" } }))).toBe(false);
  });

  it("limits repeated requests within the same window", () => {
    const scope = `test-${Date.now()}-${Math.random()}`;
    const request = new NextRequest("https://ruleradar.se/api/contact", { headers: { "x-forwarded-for": "203.0.113.20" } });
    expect(isRateLimited(request, scope, 2, 60_000)).toBe(false);
    expect(isRateLimited(request, scope, 2, 60_000)).toBe(false);
    expect(isRateLimited(request, scope, 2, 60_000)).toBe(true);
  });
});
