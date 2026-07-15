import { NextRequest, NextResponse } from "next/server";
import { updateContactRequestStatus } from "@ruleradar/db";
import { requireApiAdmin } from "../../../../auth";
import { appUrl, isSameOrigin } from "../../../../request-guard";

const leadStatuses = new Set(["new", "contacted", "qualified", "pilot", "won", "lost"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const form = await request.formData();
  const status = String(form.get("status") || "");
  if (!leadStatuses.has(status)) return NextResponse.json({ error: "Invalid lead status." }, { status: 400 });

  await updateContactRequestStatus(id, status as "new" | "contacted" | "qualified" | "pilot" | "won" | "lost");
  return NextResponse.redirect(appUrl("/admin?lead=saved"), { status: 303 });
}
