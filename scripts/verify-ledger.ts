import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, connection } from "../src/db";
try {
  const result = await db().execute(
    sql`SELECT j.id, SUM(l.amount_minor) AS balance, COUNT(l.id) AS lines FROM journals j LEFT JOIN ledger_lines l ON l.journal_id=j.id GROUP BY j.id HAVING COALESCE(SUM(l.amount_minor),0)<>0 OR COUNT(l.id)<2`,
  );
  const rows = Array.isArray(result) ? result : (result as any).rows;
  if (rows.length)
    throw new Error("Unbalanced journals found: " + JSON.stringify(rows));
  console.log(
    "PASS: every journal is balanced and contains at least two lines.",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await connection().close();
}
