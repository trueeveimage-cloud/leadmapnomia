import { NextRequest, NextResponse } from "next/server";
import { createContactRequest } from "@ruleradar/db";
import { sendEmail } from "@ruleradar/notifications";
import { loadConfig } from "@ruleradar/shared";
import { isRateLimited, isSameOrigin } from "../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "contact", 5, 15 * 60 * 1000)) {
    return NextResponse.redirect(new URL("/contact?error=rate", request.url), { status: 303 });
  }

  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const company = String(form.get("company") || "").trim();
  const teamSize = String(form.get("teamSize") || "").trim();
  const message = String(form.get("message") || "").trim();
  const website = String(form.get("website") || "").trim();

  if (website) return NextResponse.redirect(new URL("/contact?sent=1", request.url), { status: 303 });
  if (!name || !company || !isEmail(email) || message.length < 10 || message.length > 4000) {
    return NextResponse.redirect(new URL("/contact?error=invalid", request.url), { status: 303 });
  }

  try {
    const saved = await createContactRequest({ name, email, company, teamSize, message, source: "website_contact" });
    const config = loadConfig();
    let notified = false;

    if (config.ADMIN_ALERT_EMAIL && config.RESEND_API_KEY) {
      const subject = `Ny RuleRadar-förfrågan: ${company}`;
      const text = [`Namn: ${name}`, `E-post: ${email}`, `Företag: ${company}`, `Team: ${teamSize || "Ej angivet"}`, "", message].join("\n");
      await sendEmail({
        to: config.ADMIN_ALERT_EMAIL,
        subject,
        text,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h1>${escapeHtml(subject)}</h1><p><strong>Namn:</strong> ${escapeHtml(name)}<br><strong>E-post:</strong> ${escapeHtml(email)}<br><strong>Företag:</strong> ${escapeHtml(company)}<br><strong>Team:</strong> ${escapeHtml(teamSize || "Ej angivet")}</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p></div>`
      });
      notified = true;
    }

    if (saved.mode === "fixture" && !notified) {
      return NextResponse.redirect(new URL("/contact?error=setup", request.url), { status: 303 });
    }

    return NextResponse.redirect(new URL("/contact?sent=1", request.url), { status: 303 });
  } catch {
    return NextResponse.redirect(new URL("/contact?error=send", request.url), { status: 303 });
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}
