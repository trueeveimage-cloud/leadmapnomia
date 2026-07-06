import { NextRequest, NextResponse } from "next/server";
import { deliverApprovedAlerts, reviewChange } from "@ruleradar/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
