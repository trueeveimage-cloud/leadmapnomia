import { extractReadableHtml, canonicalizeText, hashNormalizedText } from "./normalizer";
import type { ContentSnapshot, MonitoredSource } from "@ruleradar/shared";

const USER_AGENT = "RuleRadarSwedenBot/0.1 (+https://ruleradar.se; official-source-change-monitor)";

export async function fetchSourceSnapshot(source: MonitoredSource): Promise<ContentSnapshot> {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": source.strategy === "pdf" ? "application/pdf,*/*" : "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8"
    },
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${source.url}`);

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const fetchedAt = new Date().toISOString();
  let title: string | undefined;
  let text: string;
  let pageHashes: Record<string, string> = {};

  if (source.strategy === "pdf" || contentType.includes("pdf") || source.url.toLowerCase().endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    title = parsed.info?.Title || source.name;
    text = canonicalizeText(parsed.text);
    pageHashes = { full_document: hashNormalizedText(text) };
  } else {
    const extracted = extractReadableHtml(buffer.toString("utf8"));
    title = extracted.title || source.name;
    text = canonicalizeText(`${extracted.text}\n\nLinks:\n${extracted.links.join("\n")}`);
  }

  return {
    sourceId: source.id,
    normalizedText: text,
    contentHash: hashNormalizedText(text),
    pageHashes,
    metadata: {
      url: source.url,
      finalUrl: response.url,
      title,
      contentType,
      etag: response.headers.get("etag") || undefined,
      lastModified: response.headers.get("last-modified") || undefined,
      fetchedAt,
      status: response.status
    }
  };
}
