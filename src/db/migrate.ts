import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connection } from "./index";
import { sql } from "drizzle-orm";
import { settings, accounts } from "./schema";
import { chartAccounts } from "@/lib/domain";
export async function migrate() {
  const conn = connection();
  await conn.raw(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = await conn.db.execute(
    sql`SELECT name,checksum FROM schema_migrations`,
  );
  const rows = (Array.isArray(applied) ? applied : (applied as any).rows) as {
    name: string;
    checksum: string;
  }[];
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const content = await readFile("migrations/" + name, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    const previous = rows.find((r) => r.name === name);
    if (previous) {
      if (previous.checksum !== hash)
        throw new Error("Migration checksum mismatch: " + name);
      continue;
    }
    await conn.raw(
      `BEGIN;\n${content}\nINSERT INTO schema_migrations(name,checksum) VALUES ('${name.replaceAll("'", "''")}','${hash}');\nCOMMIT;`,
    );
  }
  await conn.db
    .insert(settings)
    .values({
      id: 1,
      name: "SalonOS Studio",
      demo: process.env.DEMO_MODE === "true",
    })
    .onConflictDoNothing();
  await conn.db
    .insert(accounts)
    .values(chartAccounts.map(([code, name, type]) => ({ code, name, type })))
    .onConflictDoNothing();
}
