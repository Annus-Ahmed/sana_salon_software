import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, sessions, loginAttempts } from "@/db/schema";
import { DomainError, type Actor } from "@/lib/domain";
const scrypt = promisify(scryptCallback);
export const COOKIE = "salonos_session";
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32 || s.startsWith("replace-with"))
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  return s;
}
export function digest(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export async function hashPassword(password: string) {
  if (password.length < 12)
    throw new DomainError("Use at least 12 characters for passwords.");
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const [algorithm, salt, hex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hex) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export async function actorFromToken(
  token: string | undefined,
): Promise<Actor | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [row] = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, digest(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.active, true),
      ),
    );
  return row ?? null;
}
export async function getActor() {
  return actorFromToken((await cookies()).get(COOKIE)?.value);
}
export async function requireActor() {
  const actor = await getActor();
  if (!actor) throw new DomainError("Please sign in to continue.", 401);
  return actor;
}
export async function login(email: string, password: string, ip: string) {
  const normalized = email.trim().toLowerCase();
  const keys = [digest("email:" + normalized), digest("ip:" + ip)];
  for (const key of keys) {
    await db()
      .insert(loginAttempts)
      .values({ key, count: 1, windowStart: new Date() })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`CASE WHEN ${loginAttempts.windowStart} < now() - interval '15 minutes' THEN 1 ELSE ${loginAttempts.count}+1 END`,
          windowStart: sql`CASE WHEN ${loginAttempts.windowStart} < now() - interval '15 minutes' THEN now() ELSE ${loginAttempts.windowStart} END`,
        },
      });
  }
  const attempts = await db()
    .select()
    .from(loginAttempts)
    .where(sql`${loginAttempts.key} IN (${keys[0]},${keys[1]})`);
  if (attempts.some((a) => a.count > (a.key === keys[0] ? 8 : 40)))
    throw new DomainError(
      "Too many login attempts. Try again in 15 minutes.",
      429,
    );
  const [user] = await db()
    .select()
    .from(users)
    .where(and(eq(users.email, normalized), eq(users.active, true)));
  // Perform the expensive hash even for an unknown email.
  const fallback = "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
  const valid = await checkPassword(password, user?.passwordHash ?? fallback);
  if (!user || !valid)
    throw new DomainError("Email or password is incorrect.", 401);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await db()
    .insert(sessions)
    .values({ id: digest(token), userId: user.id, expiresAt });
  return {
    token,
    expiresAt,
    actor: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}
export async function logout(token: string | undefined) {
  if (token)
    await db()
      .delete(sessions)
      .where(eq(sessions.id, digest(token)));
}
