import { NextRequest, NextResponse } from "next/server";
import { updateNotificationSettings } from "@ruleradar/db";
import { requireApiUser } from "../../../auth";
import { appUrl, isSameOrigin } from "../../../request-guard";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const form = await request.formData();
  const recipientEmail = String(form.get("recipientEmail") || "").trim();
  const recipientId = String(form.get("recipientId") || "").trim();
  const deliveryMode = String(form.get("deliveryMode") || "immediate");
  const topics = String(form.get("topics") || "")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

  if (!recipientEmail) {
    return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
  }

  await updateNotificationSettings({
    organizationId: auth.session?.organizationId || undefined,
    recipientId: recipientId || undefined,
    recipientEmail,
    immediate: deliveryMode === "immediate",
    dailyDigest: true,
    topics
  });

  return NextResponse.redirect(appUrl("/app/settings?saved=notifications"), { status: 303 });
}
