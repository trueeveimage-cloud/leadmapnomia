import { spawn } from "node:child_process";

const port = Number(process.env.AUTH_SMOKE_PORT || 3014);
const baseUrl = `http://127.0.0.1:${port}`;
const output = [];
let logs = "";

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "apps/web", "-p", String(port)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      SESSION_SECRET: process.env.SESSION_SECRET || "ruleradar-local-auth-smoke-secret"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }
);

server.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  logs += chunk.toString();
});

try {
  await waitForServer();
  await check("public homepage", "/", [200]);
  await check("customer app", "/app", [307, 308], "/login?next=%2Fapp", "Senaste källändringar");
  await check("operator dashboard", "/admin", [307, 308], "/login?next=%2Fadmin", "Systemberedskap");
  await checkProtectedMutation();
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (logs.trim()) console.error(logs.trim());
  process.exitCode = 1;
} finally {
  server.kill();
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("The production server exited before the smoke test started.");
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the production server.");
}

async function check(label, path, expectedStatuses, expectedLocation, protectedContent) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const location = response.headers.get("location");
  const body = await response.text();
  const directRedirect = expectedStatuses.includes(response.status) && location?.endsWith(expectedLocation || "");
  const streamedRedirect =
    response.status === 200 &&
    Boolean(expectedLocation) &&
    body.includes("__next-page-redirect") &&
    body.includes(`url=${expectedLocation}`);
  if (expectedLocation && !directRedirect && !streamedRedirect) {
    throw new Error(`${label} did not redirect to ${expectedLocation}; received ${response.status}.`);
  }
  if (!expectedLocation && !expectedStatuses.includes(response.status)) {
    throw new Error(`${label} returned ${response.status}; expected ${expectedStatuses.join(" or ")}.`);
  }
  if (protectedContent && body.includes(protectedContent)) {
    throw new Error(`${label} exposed protected page content before authentication.`);
  }
  output.push({
    label,
    status: response.status,
    location: directRedirect ? location : streamedRedirect ? expectedLocation : null,
    mode: streamedRedirect ? "streamed redirect" : directRedirect ? "HTTP redirect" : "response"
  });
}

async function checkProtectedMutation() {
  const response = await fetch(`${baseUrl}/api/admin/sources`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: baseUrl
    },
    body: "name=Smoke+test"
  });
  if (response.status !== 401) {
    throw new Error(`protected admin mutation returned ${response.status}; expected 401.`);
  }
  output.push({ label: "protected admin mutation", status: response.status, location: null });
}
