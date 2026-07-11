import { NextRequest, NextResponse } from "next/server";
import { createBetaWorkspace, databaseConfigured, getUserAuthProfileByEmail, getUserAuthProfileById } from "@ruleradar/db";
import { hashPassword, loadConfig } from "@ruleradar/shared";
import { authIsRequired, createSession, issueSessionCookie } from "../../../auth";
import { appUrl, isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  const plan = normalizePlan(String(request.nextUrl.searchParams.get("plan") || "team"));
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "signup", 6, 15 * 60 * 1000)) return signupRedirect(plan, "rate");

  const form = await request.formData();
  const organizationName = String(form.get("organizationName") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  const selectedPlan = normalizePlan(String(form.get("plan") || plan));
  const termsAccepted = String(form.get("termsAccepted") || "") === "yes";

  if (!termsAccepted) return signupRedirect(selectedPlan, "terms");
  if (!organizationName || organizationName.length > 160 || !name || name.length > 160 || !isEmail(email)) return signupRedirect(selectedPlan, "invalid");
  if (authIsRequired() && !databaseConfigured()) return signupRedirect(selectedPlan, "setup");

  if (authIsRequired() && password.length < 10) {
    return signupRedirect(selectedPlan, "invalid");
  }

  if (authIsRequired() && !loadConfig().SESSION_SECRET) {
    return signupRedirect(selectedPlan, "setup");
  }

  if (await getUserAuthProfileByEmail(email)) return signupRedirect(selectedPlan, "exists");

  try {
    const created = await createBetaWorkspace({
      organizationName,
      email,
      name,
      passwordHash: password ? await hashPassword(password) : undefined,
      planId: selectedPlan
    });
    const response = NextResponse.redirect(appUrl(`/api/billing/checkout?plan=${selectedPlan}`), { status: 303 });

    if (created.mode === "database") {
      const profile = await getUserAuthProfileById(created.userId);
      if (profile) issueSessionCookie(response, createSession(profile));
    }

    return response;
  } catch (error) {
    if (isUniqueViolation(error)) return signupRedirect(selectedPlan, "exists");
    return signupRedirect(selectedPlan, "setup");
  }
}

function normalizePlan(plan: string) {
  return plan === "solo" || plan === "multi_office" || plan === "team" ? plan : "team";
}

function signupRedirect(plan: string, error: string) {
  return NextResponse.redirect(appUrl(`/signup?plan=${plan}&error=${error}`), { status: 303 });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
