import { describe, expect, it } from "vitest";
import { extractReadableHtml, hashNormalizedText, normalizeWhitespace } from "./normalizer";

describe("normalizer", () => {
  it("removes noise and keeps readable page text", () => {
    const html = "<html><head><title>Test</title><script>x()</script></head><body><nav>Menu</nav><main><h1>Important</h1><p>Payroll changed.</p></main></body></html>";
    const result = extractReadableHtml(html);
    expect(result.title).toBe("Test");
    expect(result.text).toContain("Payroll changed.");
    expect(result.text).not.toContain("Menu");
  });

  it("normalizes whitespace and hashes stable content", () => {
    expect(normalizeWhitespace(" a   b\n\n\n c ")).toBe("a b\nc");
    expect(hashNormalizedText("a   b")).toBe(hashNormalizedText("a b"));
  });
});
