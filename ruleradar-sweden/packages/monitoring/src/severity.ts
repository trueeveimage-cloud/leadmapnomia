import type { DetectedChangeDraft, MonitoredSource, Severity } from "@ruleradar/shared";

const criticalPatterns = [
  /deadline|filing deadline|due date|förfallodag|sista dag/i,
  /tax rate|contribution rate|employer contribution|arbetsgivaravgift/i,
  /PAYE|employer declaration|arbetsgivardeklaration/i,
  /form field|blankett|SKV\s*(4786|4788)/i
];

const mediumPatterns = [
  /fee|avgift|annual report|årsredovisning/i,
  /sick leave|rehabilitation|absence|frånvaro|sjuk/i,
  /VAT|moms/i
];

export interface SeverityDecision {
  severity: Severity;
  needsHumanReview: boolean;
  reasonCodes: string[];
}

export function classifySeverity(source: MonitoredSource, diffExcerpt: string, changedRatio: number): SeverityDecision {
  const reasons: string[] = [];
  let severity: Severity = "low";

  if (source.requiresReviewByDefault) reasons.push("source_default_review");
  if (source.priority === "core") {
    severity = "medium";
    reasons.push("core_source");
  }
  if (mediumPatterns.some((pattern) => pattern.test(diffExcerpt))) {
    severity = maxSeverity(severity, "medium");
    reasons.push("operational_topic");
  }
  if (criticalPatterns.some((pattern) => pattern.test(diffExcerpt))) {
    severity = maxSeverity(severity, "high");
    reasons.push("high_impact_topic");
  }
  if (changedRatio > 0.35) {
    severity = maxSeverity(severity, "high");
    reasons.push("large_change");
  }
  if (changedRatio > 0.75) {
    severity = "critical";
    reasons.push("unusually_large_change");
  }

  return {
    severity,
    needsHumanReview: source.requiresReviewByDefault || severity === "high" || severity === "critical",
    reasonCodes: reasons
  };
}

export function applyReviewPolicy(change: DetectedChangeDraft, confidence?: number): DetectedChangeDraft {
  if (confidence !== undefined && confidence < 0.8) {
    return {
      ...change,
      needsHumanReview: true,
      reasonCodes: [...new Set([...change.reasonCodes, "low_model_confidence"])]
    };
  }
  return change;
}

function maxSeverity(left: Severity, right: Severity): Severity {
  const rank: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return rank[right] > rank[left] ? right : left;
}
