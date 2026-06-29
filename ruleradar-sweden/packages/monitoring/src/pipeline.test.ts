import { describe, expect, it } from "vitest";
import { buildLineDiff } from "./diff";
import { classifySeverity } from "./severity";
import { fallbackSummary } from "@ruleradar/ai";
import type { DetectedChangeDraft, MonitoredSource } from "@ruleradar/shared";

describe("scan to summary pipeline", () => {
  it("turns a source diff into a review-required alert draft", () => {
    const previous = "Employer contribution is unchanged.";
    const current = "Employer contribution rate changed for PAYE reporting.";
    const diff = buildLineDiff(previous, current);
    const source: MonitoredSource = {
      id: "source",
      name: "Employer contributions",
      agency: "Skatteverket",
      url: "https://example.com",
      strategy: "html",
      topics: ["payroll"],
      enabled: true,
      priority: "core"
    };
    const severity = classifySeverity(source, diff.excerpt, diff.changedRatio);
    const change: DetectedChangeDraft = {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      currentHash: "next",
      diffExcerpt: diff.excerpt,
      changedRatio: diff.changedRatio,
      severity: severity.severity,
      topics: source.topics,
      needsHumanReview: severity.needsHumanReview,
      reasonCodes: severity.reasonCodes
    };
    const summary = fallbackSummary(change, "test");
    expect(change.needsHumanReview).toBe(true);
    expect(summary.needs_human_review).toBe(true);
    expect(summary.evidence_excerpts[0]).toContain("Employer contribution");
  });
});
