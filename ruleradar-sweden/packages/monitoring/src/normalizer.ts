import * as cheerio from "cheerio";
import { sha256 } from "@ruleradar/shared";

const noiseSelectors = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "[role='navigation']",
  "[aria-label*='cookie' i]",
  "[class*='cookie' i]",
  "[id*='cookie' i]"
];

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function extractReadableHtml(html: string): { title?: string; text: string; links: string[] } {
  const $ = cheerio.load(html);
  for (const selector of noiseSelectors) $(selector).remove();
  const title = normalizeWhitespace($("title").first().text() || $("h1").first().text()).slice(0, 240) || undefined;
  const links = $("a[href]")
    .map((_, element) => String($(element).attr("href") || ""))
    .get()
    .filter(Boolean)
    .slice(0, 200);
  const mainText = $("main").text() || $("article").text() || $("body").text();
  return { title, text: normalizeWhitespace(mainText), links };
}

export function canonicalizeText(input: string): string {
  return normalizeWhitespace(input)
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "")
    .trim();
}

export function hashNormalizedText(input: string): string {
  return sha256(canonicalizeText(input));
}
