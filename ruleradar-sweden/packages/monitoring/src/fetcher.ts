import { extractReadableHtml, canonicalizeText, hashNormalizedText } from "./normalizer";
import type { ContentSnapshot, MonitoredSource } from "@ruleradar/shared";

const USER_AGENT = "RuleRadarSwedenBot/0.1 (+https://ruleradar.se; official-source-change-monitor)";
const SOURCE_TIMEOUT_MS = 20_000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export async function fetchSourceSnapshot(source: MonitoredSource): Promise<ContentSnapshot> {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": source.strategy === "pdf" ? "application/pdf,*/*" : "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${source.url}`);

  const contentType = response.headers.get("content-type") || "";
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new Error(`Source exceeds ${MAX_SOURCE_BYTES} bytes: ${source.url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error(`Source exceeds ${MAX_SOURCE_BYTES} bytes: ${source.url}`);
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
    if (looksLikeAccessChallenge(extracted.text)) throw new Error(`Source returned an access challenge: ${source.url}`);
    title = extracted.title || source.name;
    text = canonicalizeText(`${extracted.text}\n\nLinks:\n${extracted.links.join("\n")}`);
  }

  if (text.length < 40) throw new Error(`Source returned too little readable content: ${source.url}`);

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

function looksLikeAccessChallenge(text: string) {
  return /captcha|what code is in the image|support id is|enable javascript to view the page content|verify (?:that )?you are human/i.test(text);
}
