import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";
import path from "node:path";
import { mkdirSync } from "node:fs";
export type Database = PgDatabase<any, typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Connection = {
  db: Database;
  raw: (sql: string) => Promise<unknown>;
  close: () => Promise<void>;
};
const globalDb = globalThis as unknown as { salonConnection?: Connection };
export function connect(url: string): Connection {
  if (url.startsWith("pglite:")) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_EMBEDDED_DEMO !== "true"
    )
      throw new Error(
        "Production requires PostgreSQL. Embedded mode is for a local demo only.",
      );
    if (process.env.DEMO_MODE !== "true" && process.env.NODE_ENV !== "test")
      throw new Error("Embedded PostgreSQL is limited to demo/test mode.");
    const location = url.slice(7);
    const dir = location === "memory://" ? undefined : path.resolve(location);
    if (dir) mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    return {
      db: pgliteDrizzle(client, { schema }) as unknown as Database,
      raw: (sql) => client.exec(sql),
      close: () => client.close(),
    };
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: 8,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  });
  return {
    db: postgresDrizzle(pool, { schema }) as unknown as Database,
    raw: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
}
export function connection(): Connection {
  if (!globalDb.salonConnection) {
    const url = process.env.DATABASE_URL;
    if (!url)
      throw new Error(
        "DATABASE_URL is required. Run the setup steps in README.",
      );
    globalDb.salonConnection = connect(url);
  }
  return globalDb.salonConnection;
}
export function db(): Database {
  return connection().db;
}
