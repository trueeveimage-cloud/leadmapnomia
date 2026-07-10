import type { MonitoredSource, Severity, SummaryResult } from "@ruleradar/shared";

export const seedSources: MonitoredSource[] = [
  {
    id: "skv-employer-hub",
    name: "Arbetsgivaringång",
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
    name: "Arbetsgivaravgifter",
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
    name: "Vägledning för arbetsgivaravgifter",
    agency: "Verksamt",
    url: "https://verksamt.se/en/employees-recruitment/costs/employer-contributions",
    strategy: "html",
    topics: ["payroll", "employer_contributions"],
    enabled: false,
    priority: "core"
  },
  {
    id: "forsakringskassan-employer-news",
    name: "Nyheter för arbetsgivare",
    agency: "Försäkringskassan",
    url: "https://www.forsakringskassan.se/arbetsgivare",
    strategy: "news_index",
    topics: ["absence_reporting", "sick_leave", "rehabilitation"],
    enabled: true,
    priority: "high"
  },
  {
    id: "bolagsverket-news",
    name: "Nyhetsarkiv",
    agency: "Bolagsverket",
    url: "https://bolagsverket.se/omoss/nyheter.2323.html",
    strategy: "news_index",
    topics: ["annual_reports", "fees", "company_filings"],
    enabled: false,
    priority: "medium"
  },
  {
    id: "arbetsmiljoverket-news",
    name: "RSS-nyheter",
    agency: "Arbetsmiljöverket",
    url: "https://www.av.se/om-oss/om-webbplatsen/rss-prenumerera/rss-nyheter/",
    strategy: "news_index",
    topics: ["work_environment", "employer_rules", "occupational_safety"],
    enabled: true,
    priority: "high",
    requiresReviewByDefault: true
  },
  {
    id: "arbetsgivarverket-agreements",
    name: "Avtal och publikationer",
    agency: "Arbetsgivarverket",
    url: "https://www.arbetsgivarverket.se/avtal-och-skrifter/",
    strategy: "html",
    topics: ["public_sector", "payroll"],
    enabled: true,
    priority: "high",
    requiresReviewByDefault: true
  }
];

export const sampleSummaries: Array<SummaryResult & { id: string; agency: string; title: string; status: string; createdAt: string }> = [
  {
    id: "sample-employer-contribution",
    agency: "Skatteverket",
    title: "Vägledning om nedsatta arbetsgivaravgifter har ändrats",
    status: "review_required",
    createdAt: "2026-06-29T09:00:00.000Z",
    source_name: "Skatteverket",
    source_url: seedSources[1]!.url,
    change_type: "rule_update",
    topics: ["payroll", "employer_contributions"],
    severity: "high",
    confidence: 0.91,
    summary_plain_english: "Skatteverket har uppdaterat vägledningen om nedsatta arbetsgivaravgifter för yngre anställda.",
    who_is_affected: "Arbetsgivare och lönebyråer med anställda i det berörda åldersintervallet.",
    recommended_action: "Kontrollera löneinställningarna före nästa arbetsgivardeklaration och verifiera källtexten.",
    needs_human_review: true,
    evidence_excerpts: ["Den ändrade texten hänvisar till nedsatta arbetsgivaravgifter och ett intervall för den anställdes födelseår."]
  },
  {
    id: "sample-employer-declaration",
    agency: "Skatteverket",
    title: "Arbetsflödet för arbetsgivardeklaration har ändrats",
    status: "approved",
    createdAt: "2026-06-28T14:20:00.000Z",
    source_name: "Skatteverket",
    source_url: seedSources[0]!.url,
    change_type: "deadline_update",
    topics: ["employer_declaration"],
    severity: "medium",
    confidence: 0.87,
    summary_plain_english: "Sidan om arbetsgivardeklaration har fått en ändrad formulering kring den månatliga rapporteringen.",
    who_is_affected: "Löneteam som förbereder månatliga arbetsgivardeklarationer.",
    recommended_action: "Bekräfta den aktuella rapporteringsordningen innan nästa deklaration lämnas in.",
    needs_human_review: false,
    evidence_excerpts: ["Det uppdaterade avsnittet beskriver när arbetsgivare lämnar sin deklaration."]
  },
  {
    id: "sample-bolagsverket-fees",
    agency: "Bolagsverket",
    title: "Sidan om årsredovisning och avgifter har ändrats",
    status: "sent",
    createdAt: "2026-06-27T16:45:00.000Z",
    source_name: "Bolagsverket",
    source_url: seedSources[4]!.url,
    change_type: "fee_update",
    topics: ["annual_reports", "fees"],
    severity: "medium",
    confidence: 0.84,
    summary_plain_english: "Bolagsverket har ändrat text på en sida om inlämningsrutiner eller avgifter.",
    who_is_affected: "Byråer som hjälper kunder med bolagsärenden eller årsredovisningar.",
    recommended_action: "Öppna källsidan och kontrollera om kundernas checklistor behöver uppdateras.",
    needs_human_review: false,
    evidence_excerpts: ["Det ändrade utdraget innehåller formuleringar om årsredovisning och avgifter."]
  }
];

export function severityRank(severity: Severity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
