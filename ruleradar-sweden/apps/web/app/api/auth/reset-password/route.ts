import { NextRequest, NextResponse } from "next/server";
import { consumePasswordResetToken, getUserAuthProfileById } from "@ruleradar/db";
import { hashPassword, sha256 } from "@ruleradar/shared";
import { createSession, issueSessionCookie } from "../../../auth";
import { appUrl, isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "reset-password", 8, 15 * 60 * 1000)) return NextResponse.redirect(appUrl("/forgot-password?sent=1"), { status: 303 });
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const passwordConfirm = String(form.get("passwordConfirm") || "");
  if (!token || password.length < 10 || password !== passwordConfirm) return NextResponse.redirect(appUrl(`/reset-password?token=${encodeURIComponent(token)}&error=invalid`), { status: 303 });
  const result = await consumePasswordResetToken(sha256(token), await hashPassword(password));
  if (result.mode !== "updated") return NextResponse.redirect(appUrl(`/reset-password?token=${encodeURIComponent(token)}&error=invalid`), { status: 303 });
  const profile = await getUserAuthProfileById(result.userId);
  if (!profile) return NextResponse.redirect(appUrl("/login?error=invalid"), { status: 303 });
  const response = NextResponse.redirect(appUrl("/app"), { status: 303 });
  issueSessionCookie(response, createSession(profile));
  return response;
}
