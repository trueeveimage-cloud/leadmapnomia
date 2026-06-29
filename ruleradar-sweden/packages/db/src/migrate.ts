import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closeDb } from "./client";
import { logger } from "@ruleradar/shared";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, "..", "migrations");

async function main() {
  const pool = getPool();
  await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const existing = await pool.query("select 1 from schema_migrations where name = $1", [file]);
    if (existing.rowCount) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (name) values ($1)", [file]);
      await pool.query("commit");
      logger.info("migration_applied", { file });
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
}

main().finally(closeDb);
