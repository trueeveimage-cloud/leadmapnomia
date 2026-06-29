import type { SummaryResult } from "@ruleradar/shared";

export interface AlertEmailInput {
  firstName?: string;
  summary: SummaryResult;
  diffExcerpt: string;
  manageUrl: string;
}

export function renderAlertEmail(input: AlertEmailInput) {
  const subject = `RuleRadar Sweden: ${input.summary.source_name} ${labelForChangeType(input.summary.change_type)}`;
  const greeting = input.firstName ? `Hello ${input.firstName},` : "Hello,";
  const footer = "This alert is informational and not legal advice. Verify the official source before filing or advising clients.";
  const text = [
    greeting,
    "",
    `What changed: ${input.summary.summary_plain_english}`,
    `Why it matters: ${input.summary.who_is_affected}`,
    `What to do: ${input.summary.recommended_action}`,
    "",
    `Severity: ${input.summary.severity}`,
    `Confidence: ${Math.round(input.summary.confidence * 100)}%`,
    `Source: ${input.summary.source_url}`,
    "",
    "Changed excerpt:",
    input.diffExcerpt,
    "",
    footer,
    `Manage notifications: ${input.manageUrl}`
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#17212b;max-width:680px;margin:0 auto;padding:24px">
      <p>${escapeHtml(greeting)}</p>
      <h1 style="font-size:22px;margin:20px 0 8px">Official source change detected</h1>
      ${block("What changed", input.summary.summary_plain_english)}
      ${block("Why it matters", input.summary.who_is_affected)}
      ${block("What to do", input.summary.recommended_action)}
      <p><strong>Severity:</strong> ${escapeHtml(input.summary.severity)}<br/><strong>Confidence:</strong> ${Math.round(input.summary.confidence * 100)}%</p>
      <p><a href="${escapeHtml(input.summary.source_url)}">Open official source</a></p>
      <pre style="white-space:pre-wrap;background:#f5f7fa;border:1px solid #d9e0e8;border-radius:6px;padding:14px">${escapeHtml(input.diffExcerpt)}</pre>
      <p style="font-size:12px;color:#5d6b7a">${escapeHtml(footer)}</p>
      <p style="font-size:12px"><a href="${escapeHtml(input.manageUrl)}">Manage notifications</a></p>
    </div>`;

  return { subject, text, html };
}

export function renderDailyDigestEmail(summaries: SummaryResult[], manageUrl: string) {
  const subject = `RuleRadar Sweden daily digest: ${summaries.length} changes`;
  const text = summaries.map((summary, index) => `${index + 1}. ${summary.source_name}: ${summary.summary_plain_english}\n${summary.source_url}`).join("\n\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.55"><h1>Daily digest</h1>${summaries.map((summary) => `<article><h2>${escapeHtml(summary.source_name)}</h2><p>${escapeHtml(summary.summary_plain_english)}</p><p><a href="${escapeHtml(summary.source_url)}">Open source</a></p></article>`).join("")}<p><a href="${escapeHtml(manageUrl)}">Manage notifications</a></p></div>`;
  return { subject, text, html };
}

type LifecycleKind = "welcome" | "trial_started" | "payment_failed" | "subscription_canceled";

const lifecycleCopy: Record<LifecycleKind, readonly [string, string]> = {
    welcome: ["Welcome to RuleRadar Sweden", "Your workspace is ready. Start by confirming monitored feeds and alert recipients."],
    trial_started: ["Your RuleRadar trial has started", "We will monitor the default Swedish payroll and filing sources during your trial."],
    payment_failed: ["Payment needs attention", "Open the billing portal to update your payment method and avoid losing access."],
    subscription_canceled: ["Subscription canceled", "Your workspace remains available until the end of the paid period."]
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
  return changeType.replace(/_/g, " ");
}

function block(label: string, value: string) {
  return `<h2 style="font-size:15px;margin:18px 0 4px">${escapeHtml(label)}</h2><p style="margin:0">${escapeHtml(value)}</p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}
