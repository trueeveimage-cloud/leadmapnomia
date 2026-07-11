import { NextRequest, NextResponse } from "next/server";
import { createPasswordResetToken } from "@ruleradar/db";
import { sendEmail } from "@ruleradar/notifications";
import { loadConfig, newId, sha256 } from "@ruleradar/shared";
import { appUrl, isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "forgot-password", 5, 15 * 60 * 1000)) return NextResponse.redirect(appUrl("/forgot-password?sent=1"), { status: 303 });
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email) return NextResponse.redirect(appUrl("/forgot-password?sent=1"), { status: 303 });

  const rawToken = newId("reset");
  const created = await createPasswordResetToken(email, sha256(rawToken), new Date(Date.now() + 60 * 60 * 1000));
  const config = loadConfig();
  if (created.mode === "created" && config.RESEND_API_KEY) {
    const resetUrl = `${config.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendEmail({
      to: created.email,
      subject: "Återställ ditt RuleRadar-lösenord",
      text: `Öppna länken inom 60 minuter för att välja ett nytt lösenord:\n\n${resetUrl}\n\nOm du inte begärde detta kan du ignorera meddelandet.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px"><h1>Återställ lösenord</h1><p>Öppna länken inom 60 minuter för att välja ett nytt lösenord.</p><p><a href="${resetUrl}">Välj nytt lösenord</a></p><p style="font-size:12px;color:#667">Om du inte begärde detta kan du ignorera meddelandet.</p></div>`
    });
  }
  return NextResponse.redirect(appUrl("/forgot-password?sent=1"), { status: 303 });
}
