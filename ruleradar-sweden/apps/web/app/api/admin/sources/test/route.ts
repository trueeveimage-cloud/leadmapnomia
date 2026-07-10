import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchSourceSnapshot } from "@ruleradar/monitoring";
import { requireApiAdmin } from "../../../../auth";
import { isSameOrigin } from "../../../../request-guard";

const inputSchema = z.object({
  name: z.string().min(1),
  agency: z.string().min(1).default("Custom"),
  url: z.string().url(),
  strategy: z.enum(["html", "news_index", "pdf", "document_page", "browser_fallback"]).default("html"),
  topics: z.array(z.string()).default([])
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const input = inputSchema.parse(await request.json());
  const snapshot = await fetchSourceSnapshot({
    id: "test-source",
    enabled: true,
    priority: "medium",
    ...input
  });
  return NextResponse.json({
    title: snapshot.metadata.title,
    hash: snapshot.contentHash,
    excerpt: snapshot.normalizedText.slice(0, 1200)
  });
}
