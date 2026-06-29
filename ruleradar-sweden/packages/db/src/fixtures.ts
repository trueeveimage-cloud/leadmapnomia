import type { MonitoredSource, Severity, SummaryResult } from "@ruleradar/shared";

export const seedSources: MonitoredSource[] = [
  {
    id: "skv-employer-hub",
    name: "Employer hub",
    agency: "Skatteverket",
    url: "https://www.skatteverket.se/foretag/arbetsgivare.4.76a43be412206334b89800047942.html",
    strategy: "html",
    topics: ["payroll", "employer_declaration", "employer_contributions"],
    enabled: true,
    priority: "core",
    requiresReviewByDefault: true
  },
  {
    id: "skv-employer-contributions",
    name: "Employer contributions",
    agency: "Skatteverket",
    url: "https://www.skatteverket.se/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/arbetsgivaravgifter.4.233f91f71260075abe8800020817.html",
    strategy: "html",
    topics: ["payroll", "tax_rate", "employer_contributions"],
    enabled: true,
    priority: "core",
    requiresReviewByDefault: true
  },
  {
    id: "verksamt-employer-contributions",
    name: "Employer contributions guidance",
    agency: "Verksamt",
    url: "https://verksamt.se/en/employees-recruitment/costs/employer-contributions",
    strategy: "html",
    topics: ["payroll", "employer_contributions"],
    enabled: true,
    priority: "core"
  },
  {
    id: "forsakringskassan-employer-news",
    name: "Employer news",
    agency: "Forsakringskassan",
    url: "https://www.forsakringskassan.se/arbetsgivare",
    strategy: "news_index",
    topics: ["absence_reporting", "sick_leave", "rehabilitation"],
    enabled: true,
    priority: "high"
  },
  {
    id: "bolagsverket-news",
    name: "News archive",
    agency: "Bolagsverket",
    url: "https://bolagsverket.se/omoss/nyheter.2323.html",
    strategy: "news_index",
    topics: ["annual_reports", "fees", "company_filings"],
    enabled: true,
    priority: "medium"
  },
  {
    id: "arbetsgivarverket-agreements",
    name: "Agreements and publications",
    agency: "Arbetsgivarverket",
    url: "https://www.arbetsgivarverket.se/avtal-och-skrifter/",
    strategy: "html",
    topics: ["public_sector", "payroll"],
    enabled: false,
    priority: "optional"
  }
];

export const sampleSummaries: Array<SummaryResult & { id: string; agency: string; title: string; status: string; createdAt: string }> = [
  {
    id: "sample-employer-contribution",
    agency: "Skatteverket",
    title: "Reduced employer contribution guidance changed",
    status: "review_required",
    createdAt: "2026-06-29T09:00:00.000Z",
    source_name: "Skatteverket",
    source_url: seedSources[1]!.url,
    change_type: "rule_update",
    topics: ["payroll", "employer_contributions"],
    severity: "high",
    confidence: 0.91,
    summary_plain_english: "Skatteverket updated guidance about reduced employer contributions for younger employees.",
    who_is_affected: "Employers and payroll bureaus with employees in the affected age range.",
    recommended_action: "Review payroll settings before the next employer declaration and verify the source text.",
    needs_human_review: true,
    evidence_excerpts: ["The changed text references reduced employer contributions and an employee birth-year range."]
  },
  {
    id: "sample-employer-declaration",
    agency: "Skatteverket",
    title: "Employer declaration workflow text changed",
    status: "approved",
    createdAt: "2026-06-28T14:20:00.000Z",
    source_name: "Skatteverket",
    source_url: seedSources[0]!.url,
    change_type: "deadline_update",
    topics: ["employer_declaration"],
    severity: "medium",
    confidence: 0.87,
    summary_plain_english: "The employer declaration page changed wording around monthly filing steps.",
    who_is_affected: "Payroll teams that prepare monthly employer declarations.",
    recommended_action: "Confirm the current filing sequence before submitting the next declaration.",
    needs_human_review: false,
    evidence_excerpts: ["The updated section describes when employers file their declaration."]
  },
  {
    id: "sample-bolagsverket-fees",
    agency: "Bolagsverket",
    title: "Annual report and fee page changed",
    status: "sent",
    createdAt: "2026-06-27T16:45:00.000Z",
    source_name: "Bolagsverket",
    source_url: seedSources[4]!.url,
    change_type: "fee_update",
    topics: ["annual_reports", "fees"],
    severity: "medium",
    confidence: 0.84,
    summary_plain_english: "Bolagsverket changed text on a page related to filing procedures or fees.",
    who_is_affected: "Firms that help clients with company filings or annual reports.",
    recommended_action: "Open the source page and confirm whether customer filing checklists need an update.",
    needs_human_review: false,
    evidence_excerpts: ["The changed excerpt includes annual report and fee language."]
  }
];

export function severityRank(severity: Severity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
