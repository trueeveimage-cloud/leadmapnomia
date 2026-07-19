const baseUrl = (process.argv[2] || process.env.APP_URL || "https://ruleradar.se").replace(/\/$/, "");
const results = [];

await checkHtml("homepage", "/", "RuleRadar");
await checkHtml("pricing", "/pricing", "399");
await checkHtml("signup", "/signup", "Stripe");
await checkHtml("privacy", "/privacy", "Personuppgiftsansvarig");
await checkHtml("terms", "/terms", "Svensk lag");
await checkJson("web health", "/api/health", (value) => value.ok === true && value.database?.migrationsApplied === 7 && value.database?.migrationsExpected === 7);
await checkJson("worker health", "/api/health/worker", (value) => value.ok === true && value.staleSources === 0 && value.degradedSources === 0);

console.log(JSON.stringify({ ok: true, baseUrl, checkedAt: new Date().toISOString(), results }, null, 2));

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "RuleRadar production smoke test" }
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
  return response;
}

async function checkHtml(label, path, expectedText) {
  const response = await request(path);
  const body = await response.text();
  if (!body.includes(expectedText)) throw new Error(`${path} did not contain expected text: ${expectedText}`);
  results.push({ label, path, status: response.status });
}

async function checkJson(label, path, validate) {
  const response = await request(path);
  const value = await response.json();
  if (!validate(value)) throw new Error(`${path} returned an unhealthy payload.`);
  results.push({ label, path, status: response.status });
}
