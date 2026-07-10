import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const webRoot = path.join(root, "apps", "web");
const outputRoot = path.join(root, ".qa");
const port = 3013;
const baseUrl = `http://127.0.0.1:${port}`;
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const generatedConfigPaths = [path.join(webRoot, "next-env.d.ts"), path.join(webRoot, "tsconfig.json")];
const generatedConfigContents = await Promise.all(generatedConfigPaths.map((file) => readFile(file, "utf8")));

await mkdir(outputRoot, { recursive: true });
const server = spawn(process.execPath, [nextCli, "dev", "-p", String(port)], {
  cwd: webRoot,
  env: { ...process.env, VISUAL_QA: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const routes = [
    ["home", "/"],
    ["pricing", "/pricing"],
    ["signup", "/signup?plan=team"],
    ["dashboard", "/app"],
    ["admin", "/admin"]
  ];
  const viewports = [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }]
  ];
  const results = [];

  for (const [viewportName, viewport] of viewports) {
    const context = await browser.newContext({ viewport });
    for (const [routeName, route] of routes) {
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      const layout = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        bodyWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        overflow: document.body.scrollWidth > document.documentElement.clientWidth + 1
      }));
      await page.screenshot({ path: path.join(outputRoot, `${routeName}-${viewportName}.png`), fullPage: true });
      results.push({ route, viewport: viewportName, status: response?.status(), ...layout, errors });
      await page.close();
    }
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => !result.status || result.status >= 400 || result.overflow || result.errors.length)) process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  await Promise.all(generatedConfigPaths.map((file, index) => writeFile(file, generatedConfigContents[index], "utf8")));
}

async function waitForServer() {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next server did not start.\n${serverLog}`);
}
