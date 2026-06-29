import { describe, expect, it } from "vitest";
import { summarySchema } from "./schema";

describe("summary schema", () => {
  it("accepts the required structured summary shape", () => {
    const result = summarySchema.parse({
      source_name: "Skatteverket",
      source_url: "https://www.skatteverket.se",
      change_type: "rule_update",
      topics: ["payroll"],
      severity: "high",
      confidence: 0.9,
      summary_plain_english: "Skatteverket changed guidance that payroll teams should review before filing.",
      who_is_affected: "Payroll teams",
      recommended_action: "Review the source before the next filing.",
      needs_human_review: true,
      evidence_excerpts: ["Changed employer contribution wording"]
    });
    expect(result.source_name).toBe("Skatteverket");
  });

  it("rejects unbounded free-form output", () => {
    expect(() => summarySchema.parse({ hello: "world" })).toThrow();
  });
});
