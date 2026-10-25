import "dotenv/config";
import { db, connection } from "../src/db";
import { users, sessions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/server/auth";
const {
  ADMIN_NAME: name,
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: password,
  ADMIN_ROLE: role,
} = process.env;
try {
  if (
    !name ||
    !email ||
    !password ||
    !["finance_manager", "owner"].includes(role ?? "")
  )
    throw new Error(
      "Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars), and ADMIN_ROLE (finance_manager or owner) in your environment.",
    );
  const [user] = await db()
    .insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      role: role as "owner" | "finance_manager",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name,
        passwordHash: await hashPassword(password),
        role: role as "owner" | "finance_manager",
        active: true,
      },
    })
    .returning();
  await db().delete(sessions).where(eq(sessions.userId, user.id));
  console.log(`Account saved for ${user.email}. Previous sessions revoked.`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await connection().close();
}
