import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { migrate } from "../src/db/migrate";
import { seedDemo } from "./seed";
import { connection } from "../src/db";
if (existsSync(".env")) {
  console.error(
    "A .env already exists. To keep your settings safe, setup will not overwrite it. For an existing isolated demo, run db:migrate then db:seed.",
  );
  process.exit(1);
}
const manager = "Salon-" + randomBytes(9).toString("base64url"),
  owner = "Owner-" + randomBytes(9).toString("base64url");
writeFileSync(
  ".env",
  `DATABASE_URL=pglite:.data/demo\nDATABASE_SSL=false\nAPP_ORIGIN=http://localhost:3000\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nDEMO_MODE=true\nDEMO_MANAGER_PASSWORD=${manager}\nDEMO_OWNER_PASSWORD=${owner}\n`,
  { mode: 0o600 },
);
config({ quiet: true });
try {
  await migrate();
  await seedDemo();
  console.log(
    `\nLocal DEMO ready. Start: npm run dev\nManager: manager@salonos.demo\nPassword: ${manager}\nOwner: owner@salonos.demo\nPassword: ${owner}\n\nPasswords are stored only in your ignored .env. This is fictional demo data, not a production setup.`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await connection().close();
}
