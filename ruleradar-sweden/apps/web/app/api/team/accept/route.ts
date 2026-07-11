import { NextRequest, NextResponse } from "next/server";
import { acceptOrganizationInvite, getUserAuthProfileById } from "@ruleradar/db";
import { hashPassword, sha256 } from "@ruleradar/shared";
import { createSession, issueSessionCookie } from "../../../auth";
import { appUrl, isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "accept-invite", 8, 15 * 60 * 1000)) return NextResponse.redirect(appUrl("/login?error=rate"), { status: 303 });
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  const passwordConfirm = String(form.get("passwordConfirm") || "");
  const acceptedTerms = String(form.get("termsAccepted") || "") === "yes";
  if (!token || !name || password.length < 10 || password !== passwordConfirm || !acceptedTerms) return invalidRedirect(token, "invalid");
  const result = await acceptOrganizationInvite({ tokenHash: sha256(token), name, passwordHash: await hashPassword(password) });
  if (result.mode === "existing_other_workspace") return invalidRedirect(token, "workspace");
  if (result.mode !== "accepted") return invalidRedirect(token, "invalid");
  const profile = await getUserAuthProfileById(result.userId);
  if (!profile) return invalidRedirect(token, "invalid");
  const response = NextResponse.redirect(appUrl("/app/team?joined=1"), { status: 303 });
  issueSessionCookie(response, createSession(profile));
  return response;
}

function invalidRedirect(token: string, error: string) { return NextResponse.redirect(appUrl(`/join?token=${encodeURIComponent(token)}&error=${error}`), { status: 303 }); }
