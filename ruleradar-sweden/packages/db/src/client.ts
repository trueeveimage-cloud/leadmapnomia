import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadConfig } from "@ruleradar/shared";
import * as schema from "./schema";

let pool: pg.Pool | null = null;

export function getPool() {
  const config = loadConfig();
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for database access");
  pool ??= new pg.Pool({ connectionString: config.DATABASE_URL, max: 8 });
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
}
