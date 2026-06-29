import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for backup:logical");
  process.exit(1);
}

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = join("backups", `ruleradar-${stamp}.sql.gz`);
const shell = process.platform === "win32" ? "powershell.exe" : "sh";
const command = process.platform === "win32"
  ? `pg_dump "${databaseUrl}" | gzip > "${output}"`
  : `pg_dump "${databaseUrl}" | gzip > "${output}"`;
const result = spawnSync(shell, process.platform === "win32" ? ["-NoProfile", "-Command", command] : ["-lc", command], { stdio: "inherit" });
process.exit(result.status ?? 1);
