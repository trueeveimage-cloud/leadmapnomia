import { describe, expect, it } from "vitest";
import type { SummaryResult } from "@ruleradar/shared";
import { renderDailyDigestEmail } from "./templates";

const summary: SummaryResult = {
  source_name: "Skatteverket",
  source_url: "https://example.com/source?one=1&two=2",
  change_type: "rule_update",
  topics: ["payroll"],
  severity: "high",
  confidence: 0.92,
  summary_plain_english: "Arbetsgivaravgiften har ändrats.",
  who_is_affected: "Arbetsgivare och lönebyråer.",
  recommended_action: "Kontrollera nästa lönekörning.",
  needs_human_review: false,
  evidence_excerpts: ["Ändrad procentsats."]
};

describe("daily digest email", () => {
  it("includes impact, action, source, disclaimer, and settings link", () => {
    const email = renderDailyDigestEmail([summary], "https://ruleradar.se/app/settings");
    expect(email.subject).toContain("1 ändring");
    expect(email.text).toContain(summary.who_is_affected);
    expect(email.text).toContain(summary.recommended_action);
    expect(email.text).toContain(summary.source_url);
    expect(email.text).toContain("inte juridisk rådgivning");
    expect(email.html).toContain("https://ruleradar.se/app/settings");
    expect(email.html).toContain("&amp;two=2");
  });
});
