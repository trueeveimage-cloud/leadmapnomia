import { NextRequest, NextResponse } from "next/server";
import { createSource } from "@ruleradar/db";
import type { FetchStrategy } from "@ruleradar/shared";
import { requireApiAdmin } from "../../../auth";
import { appUrl, isSameOrigin } from "../../../request-guard";

const strategies = new Set(["html", "news_index", "pdf", "document_page", "browser_fallback"]);

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const agency = String(form.get("agency") || "").trim();
  const url = String(form.get("url") || "").trim();
  const strategyValue = String(form.get("strategy") || "html");
  const priority = String(form.get("priority") || "medium");
  const topics = String(form.get("topics") || "")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

  if (!name || !agency || !url || !strategies.has(strategyValue)) {
    return NextResponse.json({ error: "Valid name, agency, URL, and strategy are required." }, { status: 400 });
  }

  await createSource({
    name,
    agency,
    url,
    strategy: strategyValue as FetchStrategy,
    topics,
    priority,
    requiresReviewByDefault: true
  });

  return NextResponse.redirect(appUrl("/admin/sources?saved=source"), { status: 303 });
}
