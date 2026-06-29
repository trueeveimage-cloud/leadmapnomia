import { z } from "zod";

export const summarySchema = z.object({
  source_name: z.string().min(1),
  source_url: z.string().url(),
  change_type: z.enum(["rule_update", "form_update", "deadline_update", "fee_update", "news_update", "unknown"]),
  topics: z.array(z.string().min(1)),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  summary_plain_english: z.string().min(20),
  who_is_affected: z.string().min(3),
  recommended_action: z.string().min(3),
  needs_human_review: z.boolean(),
  evidence_excerpts: z.array(z.string().min(3)).min(1)
});

export const summaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "source_name",
    "source_url",
    "change_type",
    "topics",
    "severity",
    "confidence",
    "summary_plain_english",
    "who_is_affected",
    "recommended_action",
    "needs_human_review",
    "evidence_excerpts"
  ],
  properties: {
    source_name: { type: "string" },
    source_url: { type: "string" },
    change_type: { type: "string", enum: ["rule_update", "form_update", "deadline_update", "fee_update", "news_update", "unknown"] },
    topics: { type: "array", items: { type: "string" } },
    severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary_plain_english: { type: "string" },
    who_is_affected: { type: "string" },
    recommended_action: { type: "string" },
    needs_human_review: { type: "boolean" },
    evidence_excerpts: { type: "array", minItems: 1, items: { type: "string" } }
  }
} as const;
