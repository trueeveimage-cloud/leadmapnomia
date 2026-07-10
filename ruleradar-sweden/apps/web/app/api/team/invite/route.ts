import { NextRequest, NextResponse } from "next/server";
import { createOrganizationInvite, revokeOrganizationInvite } from "@ruleradar/db";
import { sendEmail } from "@ruleradar/notifications";
import { loadConfig, newId, sha256 } from "@ruleradar/shared";
import { requireApiUser } from "../../../auth";
import { isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (!auth.session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!auth.session.organizationId || !["owner", "admin"].includes(auth.session.role || "")) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  if (isRateLimited(request, `invite:${auth.session.organizationId}`, 10, 60 * 60 * 1000)) return redirectError(request, "rate");
  const config = loadConfig();
  if (!config.RESEND_API_KEY) return redirectError(request, "setup");

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const role = String(form.get("role") || "member") === "admin" ? "admin" : "member";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirectError(request, "invalid");

  const rawToken = newId("invite");
  const result = await createOrganizationInvite({ organizationId: auth.session.organizationId, email, role, tokenHash: sha256(rawToken), invitedByUserId: auth.session.userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  if (result.mode === "seat_limit") return redirectError(request, "seat_limit");
  if (result.mode === "member_exists" || result.mode === "invite_exists") return redirectError(request, "exists");
  if (result.mode !== "created") return redirectError(request, "setup");

  const joinUrl = `${config.APP_URL}/join?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendEmail({
      to: email,
      subject: "Du är inbjuden till en RuleRadar-arbetsyta",
      text: `${auth.session.name || auth.session.email} har bjudit in dig till RuleRadar. Öppna länken inom sju dagar:\n\n${joinUrl}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px"><h1>Du är inbjuden till RuleRadar</h1><p>${escapeHtml(auth.session.name || auth.session.email)} har bjudit in dig till teamets arbetsyta.</p><p><a href="${joinUrl}">Acceptera inbjudan</a></p><p style="font-size:12px;color:#667">Länken gäller i sju dagar.</p></div>`
    });
    return NextResponse.redirect(new URL("/app/team?invited=1", request.url), { status: 303 });
  } catch {
    await revokeOrganizationInvite(result.inviteId, auth.session.organizationId);
    return redirectError(request, "send");
  }
}

function redirectError(request: NextRequest, error: string) { return NextResponse.redirect(new URL(`/app/team?error=${error}`, request.url), { status: 303 }); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!)); }
