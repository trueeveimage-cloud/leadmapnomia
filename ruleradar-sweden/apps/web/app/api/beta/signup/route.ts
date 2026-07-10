import { NextRequest, NextResponse } from "next/server";
import { createBetaWorkspace, databaseConfigured, getUserAuthProfileByEmail, getUserAuthProfileById } from "@ruleradar/db";
import { hashPassword, loadConfig } from "@ruleradar/shared";
import { authIsRequired, createSession, issueSessionCookie } from "../../../auth";
import { isRateLimited, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  const plan = normalizePlan(String(request.nextUrl.searchParams.get("plan") || "team"));
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request, "signup", 6, 15 * 60 * 1000)) return signupRedirect(request, plan, "rate");

  const form = await request.formData();
  const organizationName = String(form.get("organizationName") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  const selectedPlan = normalizePlan(String(form.get("plan") || plan));
  const termsAccepted = String(form.get("termsAccepted") || "") === "yes";

  if (!termsAccepted) return signupRedirect(request, selectedPlan, "terms");
  if (!organizationName || organizationName.length > 160 || !name || name.length > 160 || !isEmail(email)) return signupRedirect(request, selectedPlan, "invalid");
  if (authIsRequired() && !databaseConfigured()) return signupRedirect(request, selectedPlan, "setup");

  if (authIsRequired() && password.length < 10) {
    return signupRedirect(request, selectedPlan, "invalid");
  }

  if (authIsRequired() && !loadConfig().SESSION_SECRET) {
    return signupRedirect(request, selectedPlan, "setup");
  }

  if (await getUserAuthProfileByEmail(email)) return signupRedirect(request, selectedPlan, "exists");

  try {
    const created = await createBetaWorkspace({
      organizationName,
      email,
      name,
      passwordHash: password ? await hashPassword(password) : undefined,
      planId: selectedPlan
    });
    const response = NextResponse.redirect(new URL(`/api/billing/checkout?plan=${selectedPlan}`, request.url), { status: 303 });

    if (created.mode === "database") {
      const profile = await getUserAuthProfileById(created.userId);
      if (profile) issueSessionCookie(response, createSession(profile));
    }

    return response;
  } catch (error) {
    if (isUniqueViolation(error)) return signupRedirect(request, selectedPlan, "exists");
    return signupRedirect(request, selectedPlan, "setup");
  }
}

function normalizePlan(plan: string) {
  return plan === "solo" || plan === "multi_office" || plan === "team" ? plan : "team";
}

function signupRedirect(request: NextRequest, plan: string, error: string) {
  return NextResponse.redirect(new URL(`/signup?plan=${plan}&error=${error}`, request.url), { status: 303 });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
