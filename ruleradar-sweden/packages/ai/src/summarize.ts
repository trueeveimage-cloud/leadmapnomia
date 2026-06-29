import OpenAI from "openai";
import { loadConfig, type DetectedChangeDraft, type SummaryResult } from "@ruleradar/shared";
import { summaryJsonSchema, summarySchema } from "./schema";

export async function summarizeChange(change: DetectedChangeDraft): Promise<SummaryResult> {
  const config = loadConfig();
  if (!config.OPENAI_API_KEY) return fallbackSummary(change, "OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({
      model: config.OPENAI_MODEL,
      store: false,
      input: [
        {
          role: "system",
          content: "You summarize detected changes on official Swedish government sources for accounting and payroll firms. Summarize only the detected change, avoid speculation, cite evidence excerpts from the changed text, and recommend human review when uncertain. This is informational, not legal advice."
        },
        {
          role: "user",
          content: JSON.stringify({
            source_name: change.sourceName,
            source_url: change.sourceUrl,
            topics: change.topics,
            severity_hint: change.severity,
            diff_excerpt: change.diffExcerpt
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "rule_radar_summary",
          strict: true,
          schema: summaryJsonSchema
        }
      }
    });

    const parsed = JSON.parse(response.output_text);
    return summarySchema.parse(parsed);
  } catch (error) {
    return fallbackSummary(change, error instanceof Error ? error.message : "Unknown OpenAI failure.");
  }
}

export function fallbackSummary(change: DetectedChangeDraft, reason: string): SummaryResult {
  return {
    source_name: change.sourceName,
    source_url: change.sourceUrl,
    change_type: "unknown",
    topics: change.topics,
    severity: change.severity,
    confidence: 0,
    summary_plain_english: "RuleRadar detected a source change, but the AI summary could not be generated safely.",
    who_is_affected: "Customers subscribed to this official source or topic.",
    recommended_action: `Open the official source and review the changed excerpt before acting. Summary fallback reason: ${reason}`,
    needs_human_review: true,
    evidence_excerpts: [change.diffExcerpt.slice(0, 500)]
  };
}
