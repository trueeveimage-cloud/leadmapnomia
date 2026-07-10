import { NextRequest, NextResponse } from "next/server";
import { deliverApprovedAlerts, reviewChange } from "@ruleradar/db";
import { requireApiAdmin } from "../../../../auth";
import { isSameOrigin } from "../../../../request-guard";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const form = await request.formData();
  const decision = String(form.get("decision") || "");
  const note = String(form.get("note") || "").trim();

  if (decision !== "approved" && decision !== "suppressed") {
    return NextResponse.json({ error: "Decision must be approved or suppressed." }, { status: 400 });
  }

  await reviewChange(id, decision, note || undefined);
  if (decision === "approved") await deliverApprovedAlerts(10);
  return NextResponse.redirect(new URL("/admin/review?reviewed=1", request.url), { status: 303 });
}
