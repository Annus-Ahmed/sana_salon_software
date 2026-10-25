import "dotenv/config";
import { migrate } from "../src/db/migrate";
import { connection } from "../src/db";
try {
  await migrate();
  console.log("Database migrations applied.");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await connection().close();
}
