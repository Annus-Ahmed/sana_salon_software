import "dotenv/config";
import { rm } from "node:fs/promises";
import { connection } from "../src/db";
import { settings } from "../src/db/schema";
import { migrate } from "../src/db/migrate";
import { seedDemo } from "./seed";
if (
  !process.argv.includes("--confirm") ||
  process.env.DEMO_MODE !== "true" ||
  process.env.DATABASE_URL !== "pglite:.data/demo"
)
  throw new Error(
    "Reset is limited to pglite:.data/demo in DEMO_MODE. Stop the server first, then run npm run demo:reset -- --confirm.",
  );
const conn = connection();
const [config] = await conn.db.select().from(settings);
if (!config?.demo)
  throw new Error("Reset refused: this database is not marked as demo.");
await conn.close();
await rm(".data/demo", { recursive: true });
// Reset in a fresh process so no stale connection is reused.
const { spawnSync } = await import("node:child_process");
for (const script of ["scripts/migrate.ts", "scripts/seed.ts"]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", script], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Isolated demo reset. Existing demo credentials retained.");
