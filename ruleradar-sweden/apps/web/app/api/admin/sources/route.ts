import { NextRequest, NextResponse } from "next/server";
import { createSource } from "@ruleradar/db";
import type { FetchStrategy } from "@ruleradar/shared";

const strategies = new Set(["html", "news_index", "pdf", "document_page", "browser_fallback"]);

export async function POST(request: NextRequest) {
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

  return NextResponse.redirect(new URL("/admin/sources?saved=source", request.url), { status: 303 });
}
