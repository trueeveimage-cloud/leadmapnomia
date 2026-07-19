import { describe, expect, it } from "vitest";
import { seedSources } from "./fixtures";
import { expectedMigrations, getMigrationStatus, listEnabledSources, runRetentionCleanup, stockholmDigestClock } from "./repository";

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

describe("migration readiness", () => {
  it("tracks every migration required by the current release", async () => {
    expect(expectedMigrations).toEqual([
      "0001_init.sql",
      "0002_alert_delivery_uniqueness.sql",
      "0003_subscription_reconciliation.sql",
      "0004_public_launch.sql",
      "0005_account_recovery_team.sql",
      "0006_release_observability.sql",
      "0007_digest_delivery_runs.sql"
    ]);
    await expect(getMigrationStatus()).resolves.toEqual({
      ok: false,
      applied: 0,
      expected: 7,
      missing: [...expectedMigrations]
    });
  });
});

describe("retention cleanup", () => {
  it("is a safe no-op without a configured production database", async () => {
    await expect(runRetentionCleanup()).resolves.toEqual({
      passwordResetTokens: 0,
      organizationInvites: 0,
      conversionEvents: 0,
      contactRequests: 0
    });
  });
});
