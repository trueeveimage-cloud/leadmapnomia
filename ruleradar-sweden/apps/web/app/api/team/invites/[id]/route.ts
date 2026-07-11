import { NextRequest, NextResponse } from "next/server";
import { revokeOrganizationInvite } from "@ruleradar/db";
import { requireApiUser } from "../../../../auth";
import { appUrl, isSameOrigin } from "../../../../request-guard";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  if (!auth.session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!auth.session.organizationId || !["owner", "admin"].includes(auth.session.role || "")) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  const { id } = await params;
  await revokeOrganizationInvite(id, auth.session.organizationId);
  return NextResponse.redirect(appUrl("/app/team"), { status: 303 });
}
