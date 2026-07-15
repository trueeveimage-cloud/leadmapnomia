import { describe, expect, it } from "vitest";
import { seedSources } from "./fixtures";
import { listEnabledSources, stockholmDigestClock } from "./repository";

describe("source scan selection", () => {
  it("returns every enabled source when no explicit limit is set", async () => {
    const sources = await listEnabledSources();
    expect(sources.map((source) => source.id)).toEqual(seedSources.filter((source) => source.enabled).map((source) => source.id));
  });

  it("honors an explicit source limit for manual scans", async () => {
    const sources = await listEnabledSources(2);
    expect(sources).toHaveLength(2);
  });
});

describe("daily digest clock", () => {
  it("uses the Stockholm calendar day and hour", () => {
    expect(stockholmDigestClock(new Date("2026-07-13T05:30:00.000Z"))).toEqual({ date: "2026-07-13", hour: 7 });
  });
});
