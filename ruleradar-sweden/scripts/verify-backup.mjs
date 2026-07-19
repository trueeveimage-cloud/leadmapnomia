import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputDirectory = resolve(process.env.BACKUP_OUTPUT_DIR || "backups");
const requested = process.argv[2] ? resolve(process.argv[2]) : null;
const archive = requested || latestArchive(outputDirectory);
if (!archive || !existsSync(archive) || statSync(archive).size === 0) {
  console.error("No non-empty .dump backup was found to verify.");
  process.exit(1);
}

const manifestPath = `${archive}.json`;
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (manifest.sha256 !== actual) {
    console.error("Backup checksum does not match its manifest.");
    process.exit(1);
  }
}

const result = spawnSync("pg_restore", ["--list", archive], { encoding: "utf8", windowsHide: true });
if (result.error) {
  console.error(`pg_restore could not start: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr || `pg_restore exited with code ${result.status}.`);
  process.exit(1);
}

const entries = result.stdout.split(/\r?\n/).filter((line) => line && !line.startsWith(";")).length;
console.log(JSON.stringify({ ok: true, archive, bytes: statSync(archive).size, entries, checksumVerified: existsSync(manifestPath) }));

function latestArchive(directory) {
  if (!existsSync(directory)) return null;
  return readdirSync(directory)
    .filter((name) => name.endsWith(".dump"))
    .map((name) => resolve(directory, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] || null;
}
