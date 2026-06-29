import { NextRequest, NextResponse } from "next/server";
import { createBetaWorkspace } from "@ruleradar/db";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const organizationName = String(form.get("organizationName") || "").trim();
  const email = String(form.get("email") || "").trim();
  const name = String(form.get("name") || "").trim();

  if (!organizationName || !email) {
    return NextResponse.json({ error: "Firm name and email are required." }, { status: 400 });
  }

  await createBetaWorkspace({ organizationName, email, name });
  return NextResponse.redirect(new URL("/app/settings?signup=created", request.url), { status: 303 });
}
