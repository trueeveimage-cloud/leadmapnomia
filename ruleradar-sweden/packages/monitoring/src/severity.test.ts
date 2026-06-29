import { describe, expect, it } from "vitest";
import { classifySeverity } from "./severity";
import type { MonitoredSource } from "@ruleradar/shared";

const source: MonitoredSource = {
  id: "s1",
  name: "Employer contributions",
  agency: "Skatteverket",
  url: "https://example.com",
  strategy: "html",
  topics: ["payroll"],
  enabled: true,
  priority: "core"
};

describe("severity classifier", () => {
  it("marks tax and filing changes as reviewable high severity", () => {
    const result = classifySeverity(source, "+ employer contribution rate and filing deadline changed", 0.1);
    expect(result.severity).toBe("high");
    expect(result.needsHumanReview).toBe(true);
    expect(result.reasonCodes).toContain("high_impact_topic");
  });

  it("escalates unusually large changes", () => {
    const result = classifySeverity(source, "+ general page copy", 0.9);
    expect(result.severity).toBe("critical");
  });
});
