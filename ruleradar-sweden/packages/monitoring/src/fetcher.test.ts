import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceSnapshot } from "./fetcher";
import type { MonitoredSource } from "@ruleradar/shared";

const source: MonitoredSource = {
  id: "test-source",
  name: "Test source",
  agency: "Test agency",
  url: "https://example.com/rules",
  strategy: "html",
  topics: ["payroll"],
  enabled: true,
  priority: "core"
};

afterEach(() => vi.unstubAllGlobals());

describe("source fetch safeguards", () => {
  it("creates a snapshot from readable official-source HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html><title>Rules</title><main><h1>Payroll rules</h1><p>This page contains enough stable official guidance to monitor safely.</p></main></html>", { status: 200, headers: { "content-type": "text/html" } })));
    const snapshot = await fetchSourceSnapshot(source);
    expect(snapshot.normalizedText).toContain("Payroll rules");
    expect(snapshot.contentHash).toHaveLength(64);
  });

  it("rejects human-verification challenges instead of baselining them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html><main>Please enable JavaScript to view the page content. What code is in the image? Support ID is 123.</main></html>", { status: 200, headers: { "content-type": "text/html" } })));
    await expect(fetchSourceSnapshot(source)).rejects.toThrow("access challenge");
  });

  it("rejects declared source bodies above the size limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("small", { status: 200, headers: { "content-type": "text/html", "content-length": String(11 * 1024 * 1024) } })));
    await expect(fetchSourceSnapshot(source)).rejects.toThrow("exceeds");
  });
});
