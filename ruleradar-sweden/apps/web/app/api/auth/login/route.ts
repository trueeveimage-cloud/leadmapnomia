import { NextRequest, NextResponse } from "next/server";
import { getUserAuthProfileByEmail } from "@ruleradar/db";
import { verifyPassword } from "@ruleradar/shared";
import { authIsRequired, createSession, issueSessionCookie } from "../../../auth";
import { isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "login", 10, 15 * 60 * 1000)) {
    return NextResponse.redirect(new URL(`/login?error=rate&next=${encodeURIComponent(readSafeNext(request) || "/app")}`, request.url), { status: 303 });
  }

  if (!authIsRequired()) {
    return NextResponse.redirect(new URL(readSafeNext(request) || "/app", request.url), { status: 303 });
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const profile = email ? await getUserAuthProfileByEmail(email) : null;

  if (!profile || !(await verifyPassword(password, profile.passwordHash))) {
    return NextResponse.redirect(new URL(`/login?error=invalid&next=${encodeURIComponent(readSafeNext(request) || "/app")}`, request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL(readSafeNext(request) || "/app", request.url), { status: 303 });
  issueSessionCookie(response, createSession(profile));
  return response;
}

function readSafeNext(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("next") || "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "";
}
