import type { SummaryResult } from "@ruleradar/shared";

export interface AlertEmailInput {
  firstName?: string;
  summary: SummaryResult;
  diffExcerpt: string;
  manageUrl: string;
}

export function renderAlertEmail(input: AlertEmailInput) {
  const subject = `RuleRadar: ${input.summary.source_name} – ${labelForChangeType(input.summary.change_type)}`;
  const greeting = input.firstName ? `Hej ${input.firstName},` : "Hej,";
  const footer = "Alerten är information, inte juridisk rådgivning. Kontrollera den officiella källan innan ni rapporterar eller ger kundråd.";
  const text = [
    greeting,
    "",
    `Vad ändrades: ${input.summary.summary_plain_english}`,
    `Vem berörs: ${input.summary.who_is_affected}`,
    `Rekommenderad åtgärd: ${input.summary.recommended_action}`,
    "",
    `Allvarlighetsgrad: ${input.summary.severity}`,
    `Säkerhet: ${Math.round(input.summary.confidence * 100)}%`,
    `Källa: ${input.summary.source_url}`,
    "",
    "Ändringsutdrag:",
    input.diffExcerpt,
    "",
    footer,
    `Hantera notifieringar: ${input.manageUrl}`
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#17212b;max-width:680px;margin:0 auto;padding:24px">
      <p>${escapeHtml(greeting)}</p>
      <h1 style="font-size:22px;margin:20px 0 8px">Ändring upptäckt i officiell källa</h1>
      ${block("Vad ändrades", input.summary.summary_plain_english)}
      ${block("Vem berörs", input.summary.who_is_affected)}
      ${block("Rekommenderad åtgärd", input.summary.recommended_action)}
      <p><strong>Allvarlighetsgrad:</strong> ${escapeHtml(input.summary.severity)}<br/><strong>Säkerhet:</strong> ${Math.round(input.summary.confidence * 100)}%</p>
      <p><a href="${escapeHtml(input.summary.source_url)}">Öppna officiell källa</a></p>
      <pre style="white-space:pre-wrap;background:#f5f7fa;border:1px solid #d9e0e8;border-radius:6px;padding:14px">${escapeHtml(input.diffExcerpt)}</pre>
      <p style="font-size:12px;color:#5d6b7a">${escapeHtml(footer)}</p>
      <p style="font-size:12px"><a href="${escapeHtml(input.manageUrl)}">Hantera notifieringar</a></p>
    </div>`;

  return { subject, text, html };
}

export function renderDailyDigestEmail(summaries: SummaryResult[], manageUrl: string) {
  const subject = `RuleRadar daglig sammanställning: ${summaries.length} ändringar`;
  const text = summaries.map((summary, index) => `${index + 1}. ${summary.source_name}: ${summary.summary_plain_english}\n${summary.source_url}`).join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55"><h1>Daglig sammanställning</h1>${summaries.map((summary) => `<article><h2>${escapeHtml(summary.source_name)}</h2><p>${escapeHtml(summary.summary_plain_english)}</p><p><a href="${escapeHtml(summary.source_url)}">Öppna källa</a></p></article>`).join("")}<p><a href="${escapeHtml(manageUrl)}">Hantera notifieringar</a></p></div>`;
  return { subject, text, html };
}

type LifecycleKind = "welcome" | "trial_started" | "payment_failed" | "subscription_canceled";

const lifecycleCopy: Record<LifecycleKind, readonly [string, string]> = {
    welcome: ["Välkommen till RuleRadar", "Er arbetsyta är klar. Börja med att kontrollera bevakade källor och alertmottagare."],
    trial_started: ["Er provperiod har startat", "RuleRadar bevakar standardkällorna för svensk lön och rapportering under provperioden."],
    payment_failed: ["Betalningen behöver åtgärdas", "Öppna kundportalen och uppdatera betalningsmetoden för att behålla åtkomsten."],
    subscription_canceled: ["Abonnemanget är uppsagt", "Arbetsytan är tillgänglig till slutet av den betalda perioden."]
};

export function renderLifecycleEmail(kind: LifecycleKind, appUrl: string) {
  const [subject, body] = lifecycleCopy[kind];
  return {
    subject,
    text: `${body}\n\n${appUrl}`,
    html: `<div style="font-family:Inter,Arial,sans-serif"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(appUrl)}">Open RuleRadar</a></p></div>`
  };
}

function labelForChangeType(changeType: SummaryResult["change_type"]) {
  return ({
    rule_update: "regeländring",
    form_update: "blankettändring",
    deadline_update: "ändrad tidsfrist",
    fee_update: "avgiftsändring",
    news_update: "nyhetsändring",
    unknown: "källändring"
  } as const)[changeType];
}

function block(label: string, value: string) {
  return `<h2 style="font-size:15px;margin:18px 0 4px">${escapeHtml(label)}</h2><p style="margin:0">${escapeHtml(value)}</p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}
