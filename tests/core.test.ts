import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
Object.assign(process.env, { NODE_ENV: "test" });
if (
  process.env.TEST_DATABASE_URL &&
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error(
    "TEST_DATABASE_URL must name an isolated database ending in _test.",
  );
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "pglite:memory://";
process.env.DEMO_MODE = "true";
process.env.SESSION_SECRET = "test-session-secret-32-characters-minimum-123456";
const { db, connection } = await import("../src/db");
const { migrate } = await import("../src/db/migrate");
const s = await import("../src/db/schema");
const { execute } = await import("../src/server/operations");
const { hashPassword, checkPassword, login, actorFromToken, logout } =
  await import("../src/server/auth");
const {
  money,
  normalizePhone,
  today,
  addDays,
  bookingBalance,
  assertBalanced,
  allocateMinor,
} = await import("../src/lib/domain");
const { snapshot } = await import("../src/server/queries");
const { summary, reportRows } = await import("../src/lib/reporting");
let manager: any,
  owner: any,
  serial = 100;
const command = (op: any, data: any, key = randomUUID()) =>
  execute(manager, op, data, key);
async function client() {
  serial++;
  return command("client.save", {
    name: "Client " + serial,
    phone: "+92301400" + String(serial).padStart(4, "0"),
  });
}
async function service(price = "10000") {
  return command("service.save", {
    name: "Makeup " + serial,
    category: "Party Makeup",
    price,
    durationMinutes: 60,
    estimatedCost: "400",
    active: true,
  });
}
async function booking(price = "10000") {
  const c = await client(),
    svc = await service(price);
  const b = await command("booking.save", {
    customerId: c.id,
    appointmentDate: today(),
    appointmentTime: "15:00",
    category: "Party",
    discount: "0",
    items: [{ serviceId: svc.id, quantity: 1, price }],
  });
  return { b, c, svc };
}
async function receive(b: any, amount = "3000", extra = {}) {
  return command("payment.receive", {
    bookingId: b.id,
    amount,
    method: "Cash",
    date: today(),
    verified: true,
    ...extra,
  });
}
async function complete(b: any) {
  return command("booking.status", {
    id: b.id,
    version: b.version,
    status: "completed",
    date: today(),
  });
}
before(async () => {
  await migrate();
  [manager, owner] = await db()
    .insert(s.users)
    .values([
      {
        name: "Manager",
        email: "manager@test.example",
        passwordHash: await hashPassword("Testing-password-123"),
        role: "finance_manager",
      },
      {
        name: "Owner",
        email: "owner@test.example",
        passwordHash: await hashPassword("Owner-testing-12345"),
        role: "owner",
      },
    ])
    .returning();
});
after(async () => {
  await connection().close();
});
test("money uses integer minor units and rejects malformed amounts", () => {
  assert.equal(money("0.10") + money("0.20"), 30);
  assert.equal(money("1234.56"), 123456);
  for (const bad of ["-1", "1.001", "1e3", "NaN", "1,000", ""])
    assert.throws(() => money(bad));
});
test("Pakistan and international phone normalization", () => {
  assert.equal(normalizePhone("0300 1234567"), "+923001234567");
  assert.equal(normalizePhone("0092-300-1234567"), "+923001234567");
  assert.throws(() => normalizePhone("123"));
});
test("secure password hashing and verification", async () => {
  const h = await hashPassword("A-unique-password-123");
  assert.ok(!h.includes("A-unique-password-123"));
  assert.equal(await checkPassword("A-unique-password-123", h), true);
  assert.equal(await checkPassword("incorrect-password", h), false);
  await assert.rejects(hashPassword("short"));
});
test("credentials login creates and revokes an opaque server session", async () => {
  const result = await login(
    manager.email,
    "Testing-password-123",
    "test-login",
  );
  assert.equal((await actorFromToken(result.token))?.id, manager.id);
  await logout(result.token);
  assert.equal(await actorFromToken(result.token), null);
  await assert.rejects(
    login(manager.email, "wrong-password", "test-login"),
    /incorrect/,
  );
});
test("owner writes are rejected by business services", async () => {
  await assert.rejects(
    execute(
      owner,
      "client.save",
      { name: "Blocked", phone: "03001231234" },
      randomUUID(),
    ),
    /read-only/,
  );
});
test("duplicate normalized clients cannot be inserted", async () => {
  await command("client.save", {
    name: "Duplicate test",
    phone: "03011234567",
  });
  await assert.rejects(
    command("client.save", { name: "Same number", phone: "+92 301 1234567" }),
    /already exists/,
  );
});
test("invalid required fields are rejected", async () => {
  await assert.rejects(command("client.save", { name: "", phone: "" }));
  await assert.rejects(command("booking.save", { items: [] }));
});
test("discounts and multiple service quantities calculate correctly", async () => {
  const c = await client(),
    svc = await service("2000");
  const b = await command("booking.save", {
    customerId: c.id,
    appointmentDate: today(),
    appointmentTime: "10:00",
    category: "Party",
    discount: "500",
    items: [{ serviceId: svc.id, quantity: 3, price: "2000" }],
  });
  assert.equal(b.subtotalMinor, 600000);
  assert.equal(b.totalMinor, 550000);
  await assert.rejects(
    command("booking.save", {
      customerId: c.id,
      appointmentDate: today(),
      appointmentTime: "10:00",
      category: "Party",
      discount: "7000",
      items: [{ serviceId: svc.id, quantity: 1, price: "2000" }],
    }),
    /Discount/,
  );
});
test("service price updates preserve historical booking snapshots", async () => {
  const { b, svc } = await booking();
  await command("service.save", {
    ...svc,
    price: "25000",
    estimatedCost: "800",
  });
  const [item] = await db()
    .select()
    .from(s.bookingItems)
    .where(eq(s.bookingItems.bookingId, b.id));
  assert.equal(item.unitPriceMinor, 1000000);
  assert.equal(item.name, svc.name);
});
test("advances create a liability, not earned revenue", async () => {
  const { b } = await booking();
  const receipt = await receive(b);
  const lines = await db()
    .select()
    .from(s.ledgerLines)
    .innerJoin(s.journals, eq(s.journals.id, s.ledgerLines.journalId))
    .where(eq(s.journals.sourceId, receipt.id));
  assert.equal(
    lines.find((l) => l.ledger_lines.accountCode === "ADVANCES")?.ledger_lines
      .amountMinor,
    -300000,
  );
  assert.ok(!lines.some((l) => l.ledger_lines.accountCode === "REVENUE"));
});
test("partial payments and completion recognize correct revenue and receivable", async () => {
  const { b } = await booking();
  await receive(b, "3000");
  await complete(b);
  const fresh = (await snapshot(manager)).bookings.find(
    (x: any) => x.id === b.id,
  );
  assert.equal(fresh.collected, 300000);
  assert.equal(fresh.outstanding, 700000);
  const lines = (await snapshot(manager)).ledger.filter(
    (l: any) => l.sourceId === b.id,
  );
  assert.equal(
    lines.find((l: any) => l.accountCode === "RECEIVABLES").amountMinor,
    700000,
  );
  assert.equal(
    lines.find((l: any) => l.accountCode === "REVENUE").amountMinor,
    -1000000,
  );
});
test("overpayments fail without adding ledger or payment records", async () => {
  const { b } = await booking();
  await receive(b, "9000");
  const before = (await db().select().from(s.payments)).length;
  await assert.rejects(receive(b, "1000.01"), /exceeds/);
  assert.equal((await db().select().from(s.payments)).length, before);
});
test("duplicate submission is idempotent and changed payload conflicts", async () => {
  const { b } = await booking();
  const key = randomUUID(),
    input = {
      bookingId: b.id,
      amount: "2000",
      method: "Cash",
      date: today(),
      verified: true,
    };
  const first = await command("payment.receive", input, key),
    second = await command("payment.receive", input, key);
  assert.equal(first.id, second.id);
  await assert.rejects(
    command("payment.receive", { ...input, amount: "1000" }, key),
    /different information/,
  );
});
test("concurrent receipts cannot overpay a booking", async () => {
  const { b } = await booking();
  const result = await Promise.allSettled([
    receive(b, "8000"),
    receive(b, "8000"),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    (await snapshot(manager)).bookings.find((x: any) => x.id === b.id)
      .collected,
    800000,
  );
});
test("unverified payments have no balance or ledger effect until verified", async () => {
  const { b } = await booking();
  const p = await receive(b, "2500", { verified: false });
  assert.equal(
    (await snapshot(manager)).bookings.find((x: any) => x.id === b.id)
      .collected,
    0,
  );
  await command("payment.verify", {
    id: p.id,
    date: today(),
    reason: "Checked bank statement screenshot",
  });
  assert.equal(
    (await snapshot(manager)).bookings.find((x: any) => x.id === b.id)
      .collected,
    250000,
  );
  await assert.rejects(
    command("payment.verify", {
      id: p.id,
      date: today(),
      reason: "Duplicate verification",
    }),
    /unverified/,
  );
});
test("completed service refunds create credits without inflating receivables", async () => {
  const { b } = await booking();
  const p = await receive(b, "10000");
  await complete(b);
  const refund = await command("payment.refund", {
    paymentId: p.id,
    amount: "2000",
    method: "Cash",
    date: today(),
    reason: "Approved service quality credit",
  });
  assert.equal(refund.creditMinor, 200000);
  let fresh = (await snapshot(manager)).bookings.find(
    (x: any) => x.id === b.id,
  );
  assert.equal(fresh.billed, 800000);
  assert.equal(fresh.collected, 800000);
  assert.equal(fresh.outstanding, 0);
  await command("payment.reverse", {
    id: refund.id,
    date: today(),
    reason: "Refund entry was a recording error",
  });
  fresh = (await snapshot(manager)).bookings.find((x: any) => x.id === b.id);
  assert.equal(fresh.billed, 1000000);
  assert.equal(fresh.collected, 1000000);
});
test("cancelled bookings retain refundable advances without sales revenue", async () => {
  const { b } = await booking();
  const p = await receive(b, "3000");
  await command("booking.status", {
    id: b.id,
    version: b.version,
    status: "cancelled",
    date: today(),
    reason: "Client cancellation approved",
  });
  let fresh = (await snapshot(manager)).bookings.find(
    (x: any) => x.id === b.id,
  );
  assert.equal(fresh.outstanding, 0);
  assert.equal(fresh.advance, 300000);
  await assert.rejects(receive(b, "100"), /closed/);
  await command("payment.refund", {
    paymentId: p.id,
    amount: "3000",
    method: "Cash",
    date: today(),
    reason: "Full cancellation refund",
  });
  fresh = (await snapshot(manager)).bookings.find((x: any) => x.id === b.id);
  assert.equal(fresh.advance, 0);
});
test("refund limits and duplicate corrections are enforced", async () => {
  const { b } = await booking();
  const p = await receive(b, "2000");
  await assert.rejects(
    command("payment.refund", {
      paymentId: p.id,
      amount: "2500",
      method: "Cash",
      date: today(),
      reason: "Invalid excess refund",
    }),
    /refundable/,
  );
  await command("payment.reverse", {
    id: p.id,
    date: today(),
    reason: "Wrong payment entered",
  });
  await assert.rejects(
    command("payment.reverse", {
      id: p.id,
      date: today(),
      reason: "Second reversal attempt",
    }),
    /already/,
  );
});
test("reversing an advance after completion reopens receivables, not negative advances", async () => {
  const { b } = await booking();
  const p = await receive(b, "3000");
  await complete(b);
  const reversal = await command("payment.reverse", {
    id: p.id,
    date: today(),
    reason: "Advance was entered incorrectly",
  });
  const lines = (await snapshot(manager)).ledger.filter(
    (l: any) => l.sourceId === reversal.id,
  );
  assert.equal(
    lines.find((l: any) => l.accountCode === "RECEIVABLES").amountMinor,
    300000,
  );
  assert.ok(!lines.some((l: any) => l.accountCode === "ADVANCES"));
});
test("future payment dates and invalid calendar dates are rejected", async () => {
  const { b } = await booking();
  await assert.rejects(
    receive(b, "100", { date: addDays(today(), 1) }),
    /future/,
  );
  await assert.rejects(receive(b, "100", { date: "2026-02-30" }));
});
test("completed booking invoices are locked", async () => {
  const { b, c, svc } = await booking();
  await complete(b);
  await assert.rejects(
    command("booking.save", {
      id: b.id,
      version: b.version + 1,
      customerId: c.id,
      appointmentDate: today(),
      appointmentTime: "12:00",
      category: "Party",
      discount: "0",
      reason: "Changing a completed invoice",
      items: [{ serviceId: svc.id, quantity: 1, price: "9000" }],
    }),
    /cannot be edited/,
  );
});
test("stale simultaneous edits fail with version conflict", async () => {
  const c = await client();
  await command("client.save", { ...c, name: "Updated name" });
  await assert.rejects(
    command("client.save", { ...c, name: "Stale change" }),
    /changed since/,
  );
});
test("capital purchases are assets and do not reduce operating profit", async () => {
  const before = summary(await snapshot(manager), today(), today());
  await command("expense.create", {
    date: today(),
    category: "Equipment",
    classification: "capital",
    amount: "25000",
    payee: "Equipment supplier",
    description: "Salon chair",
    method: "Bank transfer",
    paid: true,
  });
  const after = summary(await snapshot(manager), today(), today());
  assert.equal(after.profit, before.profit);
  assert.equal(after.capitalPurchases - before.capitalPurchases, 2500000);
});
test("unpaid expense accrues once and settlement does not duplicate costs", async () => {
  const input = {
    date: today(),
    category: "Rent",
    classification: "overhead",
    amount: "15000",
    payee: "Landlord",
    description: "Monthly studio rent",
    method: "Cash",
    paid: false,
  };
  const before = summary(await snapshot(manager), today(), today());
  const expense = await command("expense.create", input);
  const accrued = summary(await snapshot(manager), today(), today());
  assert.equal(accrued.expenses - before.expenses, 1500000);
  await command("expense.settle", {
    id: expense.id,
    date: today(),
    method: "Cash",
  });
  const paid = summary(await snapshot(manager), today(), today());
  assert.equal(paid.expenses, accrued.expenses);
  await assert.rejects(
    command("expense.settle", {
      id: expense.id,
      date: today(),
      method: "Cash",
    }),
    /unpaid/,
  );
});
test("expense reversal restores accounting but retains original record", async () => {
  const expense = await command("expense.create", {
    date: today(),
    category: "Marketing",
    classification: "overhead",
    amount: "500",
    payee: "Demo agency",
    description: "Erroneous entry",
    method: "Cash",
    paid: true,
  });
  const before = summary(await snapshot(manager), today(), today());
  await command("expense.reverse", {
    id: expense.id,
    date: today(),
    reason: "Duplicate expense recorded in error",
  });
  const after = summary(await snapshot(manager), today(), today());
  assert.equal(after.expenses, before.expenses - 50000);
  assert.equal(
    (
      await db().select().from(s.expenses).where(eq(s.expenses.id, expense.id))
    )[0].voided,
    true,
  );
});
test("direct costs require a booking link", async () => {
  await assert.rejects(
    command("expense.create", {
      date: today(),
      category: "Models",
      classification: "direct",
      amount: "2000",
      payee: "Model Example",
      description: "Booking direct cost",
      method: "Cash",
      paid: true,
    }),
    /Link a direct cost/,
  );
});
test("database rejects unbalanced journal writes at commit", async () => {
  const id = randomUUID();
  await assert.rejects(
    db().transaction(async (tx) => {
      const [j] = await tx
        .insert(s.journals)
        .values({
          id,
          date: today(),
          description: "Invalid test",
          sourceType: "test",
          sourceId: randomUUID(),
          event: "test",
          createdBy: manager.id,
        })
        .returning();
      await tx.insert(s.ledgerLines).values([
        { journalId: j.id, accountCode: "CASH", amountMinor: 100 },
        { journalId: j.id, accountCode: "REVENUE", amountMinor: -99 },
      ]);
    }),
  );
  assert.equal(
    (await db().select().from(s.journals).where(eq(s.journals.id, id))).length,
    0,
  );
});
test("ledger and audit history cannot be overwritten or deleted", async () => {
  const [j] = await db().select().from(s.journals);
  await assert.rejects(
    db()
      .update(s.journals)
      .set({ description: "Tamper" })
      .where(eq(s.journals.id, j.id)),
  );
  const [a] = await db().select().from(s.auditLogs);
  await assert.rejects(
    db().delete(s.auditLogs).where(eq(s.auditLogs.id, a.id)),
  );
  const [p] = await db()
    .select()
    .from(s.payments)
    .where(eq(s.payments.status, "posted"));
  await assert.rejects(
    db()
      .update(s.payments)
      .set({ amountMinor: 1 })
      .where(eq(s.payments.id, p.id)),
  );
});
test("all journals balance and customer subledger reconciles to control accounts", async () => {
  const data = await snapshot(manager);
  const totals: Record<string, number> = {};
  for (const l of data.ledger)
    totals[l.journalId] = (totals[l.journalId] ?? 0) + l.amountMinor;
  assert.ok(Object.values(totals).every((n) => n === 0));
  const r = summary(data, "2020-01-01", today());
  assert.equal(
    r.balances.RECEIVABLES,
    data.bookings
      .filter((b: any) => b.status === "completed")
      .reduce((a: number, b: any) => a + b.outstanding, 0),
  );
  assert.equal(
    -(r.balances.ADVANCES ?? 0),
    data.bookings
      .filter((b: any) => b.status !== "completed")
      .reduce((a: number, b: any) => a + b.collected, 0),
  );
  assert.ok(data.audit.some((a: any) => a.action === "reversed" && a.reason));
});
test("reports use actual database entries and P&L excludes customer advances", async () => {
  const data = await snapshot(manager);
  const r = summary(data, today(), today());
  const rows = reportRows(data, "profit", today(), today());
  assert.equal(
    rows.find(
      (r: any) => r.Line === "Operating profit before depreciation and tax",
    )?.PKR,
    r.profit / 100,
  );
  assert.ok(reportRows(data, "ledger", today(), today()).length > 0);
  assert.ok(reportRows(data, "receivables", today(), today()).length > 0);
});

test("one-paisa discounts are allocated without rounding drift", () => {
  assert.deepEqual(allocateMinor(299, [100, 100, 100]), [100, 100, 99]);
  assert.equal(
    allocateMinor(123456789012, [999999999999, 333333333333, 123456789]).reduce(
      (a, b) => a + b,
      0,
    ),
    123456789012,
  );
});
test("unverified reports can be rejected without creating financial activity", async () => {
  const { b } = await booking();
  const p = await receive(b, "500", { verified: false });
  await command("payment.reject", {
    id: p.id,
    date: today(),
    reason: "Staff clarified that no payment was received",
  });
  const fresh = (await snapshot(manager)).bookings.find(
    (x: any) => x.id === b.id,
  );
  assert.equal(fresh.collected, 0);
  assert.equal(fresh.payments[0].status, "rejected");
  await assert.rejects(
    command("payment.verify", {
      id: p.id,
      date: today(),
      reason: "Invalid verification attempt",
    }),
    /unverified/,
  );
});
test("simultaneous identical submissions return the same transaction", async () => {
  const { b } = await booking();
  const key = randomUUID(),
    input = {
      bookingId: b.id,
      amount: "1000",
      method: "Cash",
      date: today(),
      verified: true,
    };
  const [a, c] = await Promise.all([
    command("payment.receive", input, key),
    command("payment.receive", input, key),
  ]);
  assert.equal(a.id, c.id);
});
