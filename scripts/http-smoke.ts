import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { today, addDays } from "../src/lib/domain";
if (process.env.DEMO_MODE !== "true")
  throw new Error(
    "HTTP smoke writes fictional records. Run only against an isolated demo.",
  );
const base = process.env.SALONOS_TEST_URL ?? "http://localhost:3000",
  origin = process.env.APP_ORIGIN ?? new URL(base).origin;
let checks = 0;
function pass(name: string) {
  checks++;
  console.log("PASS: " + name);
}
async function request(
  path: string,
  cookie = "",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const response = await fetch(base + "/api/" + path, {
    signal: AbortSignal.timeout(20000),
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined
        ? {
            "Content-Type": "application/json",
            Origin: origin,
            "Idempotency-Key": randomUUID(),
          }
        : {}),
      ...extra,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response;
}
async function post(path: string, cookie: string, body: unknown, key?: string) {
  const response = await request(
    path,
    cookie,
    body,
    key ? { "Idempotency-Key": key } : {},
  );
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function signIn(email: string, password: string) {
  const r = await request("auth/login", "", { email, password });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}
assert.equal((await request("health")).status, 200);
pass("database-backed health endpoint");
assert.equal((await request("bootstrap")).status, 401);
pass("anonymous data access is blocked");
const badOrigin = await request(
  "auth/login",
  "",
  { email: "x@example.com", password: "wrong-password" },
  { Origin: "https://wrong-origin.example" },
);
assert.equal(badOrigin.status, 403);
pass("cross-origin mutation is blocked");
const manager = await signIn(
  "manager@salonos.demo",
  process.env.DEMO_MANAGER_PASSWORD!,
);
const owner = await signIn(
  "owner@salonos.demo",
  process.env.DEMO_OWNER_PASSWORD!,
);
pass("manager and owner credentials login");
const data = await (await request("bootstrap", manager)).json();
assert.ok(data.config.demo);
assert.ok(data.bookings.length >= 20);
assert.ok(data.customers.length >= 15);
assert.ok(!JSON.stringify(data.users).includes("passwordHash"));
pass("persistent demo records load through authenticated API");
const suffix = Date.now().toString().slice(-7);
const client = await post("clients", manager, {
  name: "Workflow QA " + suffix,
  phone: "+92302" + suffix,
});
const svc = await post("services", manager, {
  name: "QA makeup " + suffix,
  category: "Party Makeup",
  price: "10000",
  durationMinutes: 60,
  estimatedCost: "500",
  active: true,
});
const b = await post("bookings", manager, {
  customerId: client.id,
  appointmentDate: today(),
  appointmentTime: "15:00",
  category: "Party",
  discount: "500",
  items: [{ serviceId: svc.id, quantity: 1, price: "10000" }],
});
assert.equal(b.totalMinor, 950000);
pass("client, catalogue and discounted booking save persistently");
const key = randomUUID();
const input = {
  bookingId: b.id,
  amount: "3000",
  method: "Cash",
  date: today(),
  verified: true,
};
const p = await post("payments", manager, input, key),
  duplicate = await post("payments", manager, input, key);
assert.equal(p.id, duplicate.id);
pass("HTTP duplicate submission produces one receipt");
const over = await request("payments", manager, { ...input, amount: "7000" });
assert.equal(over.status, 400);
pass("excess payment is rejected through HTTP");
assert.equal(
  (await request("payments", manager, { ...input, date: addDays(today(), 1) }))
    .status,
  400,
);
pass("future transaction date is rejected");
await post("bookings/status", manager, {
  id: b.id,
  version: b.version,
  status: "completed",
  date: today(),
});
await post("payments", manager, {
  ...input,
  amount: "6500",
  method: "Bank transfer",
});
await post("payments/refund", manager, {
  paymentId: p.id,
  amount: "500",
  method: "Cash",
  date: today(),
  reason: "Verified workflow service credit",
});
const fresh = await (await request("bootstrap", manager)).json();
const invoice = fresh.bookings.find((x: any) => x.id === b.id);
assert.equal(invoice.billed, 900000);
assert.equal(invoice.collected, 900000);
assert.equal(invoice.outstanding, 0);
pass("advance → completion → balance receipt → refund reconciles end to end");
const expense = await post("expenses", manager, {
  date: today(),
  category: "Marketing",
  classification: "overhead",
  amount: "1000",
  payee: "QA agency",
  description: "HTTP workflow check",
  paid: false,
  method: "Cash",
});
await post("expenses/settle", manager, {
  id: expense.id,
  date: today(),
  method: "Cash",
});
assert.equal(
  (
    await request("expenses/settle", manager, {
      id: expense.id,
      date: today(),
      method: "Cash",
    })
  ).status,
  400,
);
pass("expense accrual and duplicate-proof settlement");
for (const path of [
  "clients",
  "services",
  "bookings",
  "bookings/status",
  "payments",
  "payments/verify",
  "payments/reject",
  "payments/refund",
  "payments/reverse",
  "expenses",
  "expenses/settle",
  "expenses/reverse",
])
  assert.equal((await request(path, owner, {})).status, 403, path);
pass("every business mutation endpoint rejects owner writes");
assert.equal((await request("bootstrap", owner)).status, 200);
pass("owner can read the workspace");
const csv = await request(
  "exports?kind=profit&format=csv&from=" + today() + "&to=" + today(),
  owner,
);
assert.equal(csv.status, 200);
assert.ok((await csv.text()).includes("Operating profit"));
pass("authenticated CSV export");
const xlsx = await request(
  "exports?kind=profit&format=xlsx&from=" + today() + "&to=" + today(),
  owner,
);
assert.equal(xlsx.status, 200);
const book = new ExcelJS.Workbook();
await book.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as any);
assert.ok(book.worksheets[0].rowCount > 3);
pass("Excel export downloads and parses as a real workbook");
const invalid = new FormData();
invalid.set("entity", "expense");
invalid.set("entityId", expense.id);
invalid.set(
  "file",
  new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" }),
);
assert.equal(
  (
    await fetch(base + "/api/attachments", {
      signal: AbortSignal.timeout(20000),
      method: "POST",
      headers: { Cookie: manager, Origin: origin },
      body: invalid,
    })
  ).status,
  400,
);
pass("unsafe upload format is rejected");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=",
  "base64",
);
const upload = new FormData();
upload.set("entity", "expense");
upload.set("entityId", expense.id);
upload.set("file", new File([png], "qa-receipt.png", { type: "image/png" }));
const attached = await fetch(base + "/api/attachments", {
  signal: AbortSignal.timeout(20000),
  method: "POST",
  headers: { Cookie: manager, Origin: origin },
  body: upload,
});
assert.equal(attached.status, 201);
const attachment = await attached.json();
const download = await request("attachments/" + attachment.id, owner);
assert.equal(download.status, 200);
assert.ok(
  download.headers.get("content-disposition")?.startsWith("attachment"),
);
assert.equal((await request("attachments/" + attachment.id)).status, 401);
pass("evidence persists and requires authentication to download");
await request("auth/logout", owner, {});
assert.equal((await request("bootstrap", owner)).status, 401);
await request("auth/logout", manager, {});
pass("logout revokes server sessions");
console.log(
  `\n${checks} HTTP workflow checks passed. Test records remain in this isolated demo.`,
);
