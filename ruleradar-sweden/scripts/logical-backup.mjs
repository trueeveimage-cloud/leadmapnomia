import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for backup:logical");
  process.exit(1);
}

const outputDirectory = resolve(process.env.BACKUP_OUTPUT_DIR || "backups");
mkdirSync(outputDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(outputDirectory, `ruleradar-${stamp}.dump`);
const result = spawnSync("pg_dump", [
  databaseUrl,
  "--format=custom",
  "--compress=9",
  "--no-owner",
  "--no-privileges",
  `--file=${output}`
], { stdio: "inherit", windowsHide: true });

if (result.error) {
  console.error(`pg_dump could not start: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0 || !existsSync(output) || statSync(output).size === 0) {
  console.error(`Backup failed with pg_dump exit code ${result.status ?? "unknown"}.`);
  process.exit(1);
}

const checksum = createHash("sha256").update(readFileSync(output)).digest("hex");
const manifest = {
  createdAt: new Date().toISOString(),
  file: output,
  bytes: statSync(output).size,
  sha256: checksum,
  format: "postgres-custom"
};
writeFileSync(`${output}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
