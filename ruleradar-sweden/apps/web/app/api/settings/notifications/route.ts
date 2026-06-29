import { NextRequest, NextResponse } from "next/server";
import { updateNotificationSettings } from "@ruleradar/db";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const recipientEmail = String(form.get("recipientEmail") || "").trim();
  const deliveryMode = String(form.get("deliveryMode") || "immediate");
  const topics = String(form.get("topics") || "")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

  if (!recipientEmail) {
    return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
  }

  await updateNotificationSettings({
    recipientEmail,
    immediate: deliveryMode === "immediate",
    dailyDigest: true,
    topics
  });

  return NextResponse.redirect(new URL("/app/settings?saved=notifications", request.url), { status: 303 });
}
