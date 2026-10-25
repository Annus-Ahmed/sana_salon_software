import { createHash, randomUUID } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import * as s from "@/db/schema";
import {
  DomainError,
  requireManager,
  money,
  normalizePhone,
  code,
  bookingBalance,
  financialDate,
  methodAccount,
  assertBalanced,
  type Actor,
} from "@/lib/domain";
import * as v from "./validation";
export type Operation =
  | "client.save"
  | "service.save"
  | "booking.save"
  | "booking.status"
  | "payment.receive"
  | "payment.verify"
  | "payment.reject"
  | "payment.refund"
  | "payment.reverse"
  | "expense.create"
  | "expense.settle"
  | "expense.reverse";
function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
export async function audit(
  tx: Transaction,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  await tx.insert(s.auditLogs).values({
    actorId: actor.id,
    action,
    entity,
    entityId,
    before: before === null ? null : json(before),
    after: after === null ? null : json(after),
    reason,
  });
}
async function journal(
  tx: Transaction,
  actor: Actor,
  date: string,
  sourceType: string,
  sourceId: string,
  event: string,
  description: string,
  lines: { accountCode: string; amountMinor: number; bookingId?: string }[],
) {
  const nonzero = lines.filter((l) => l.amountMinor !== 0);
  assertBalanced(nonzero);
  const [entry] = await tx
    .insert(s.journals)
    .values({
      date,
      sourceType,
      sourceId,
      event,
      description,
      createdBy: actor.id,
    })
    .returning();
  await tx
    .insert(s.ledgerLines)
    .values(nonzero.map((line) => ({ ...line, journalId: entry.id })));
}
async function booking(tx: Transaction, id: string) {
  const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, id));
  if (!b) throw new DomainError("Booking not found.", 404);
  const ps = await tx
    .select()
    .from(s.payments)
    .where(eq(s.payments.bookingId, id));
  return { b, ps, balance: bookingBalance(b, ps) };
}
function version(actual: number, expected: number | undefined) {
  if (actual !== expected)
    throw new DomainError(
      "This record changed since you opened it. Refresh before trying again.",
      409,
    );
}
function activeBooking(status: string) {
  if (["cancelled", "no_show"].includes(status))
    throw new DomainError(
      "This booking is closed. Refund any retained advance instead of taking more payments.",
    );
}
function bookingDate(b: typeof s.bookings.$inferSelect, date: string) {
  financialDate(date);
  if (b.completedDate && date < b.completedDate)
    throw new DomainError(
      "For a completed booking, use a payment/correction date on or after completion.",
    );
}
async function receiptLedger(
  tx: Transaction,
  actor: Actor,
  p: typeof s.payments.$inferSelect,
  b: typeof s.bookings.$inferSelect,
) {
  await journal(
    tx,
    actor,
    p.date,
    "payment",
    p.id,
    "receipt",
    `Receipt ${p.code}`,
    [
      {
        accountCode: methodAccount[p.method],
        amountMinor: p.amountMinor,
        bookingId: b.id,
      },
      {
        accountCode: b.status === "completed" ? "RECEIVABLES" : "ADVANCES",
        amountMinor: -p.amountMinor,
        bookingId: b.id,
      },
    ],
  );
}
const schemas = {
  "client.save": v.clientSchema,
  "service.save": v.serviceSchema,
  "booking.save": v.bookingSchema,
  "booking.status": v.statusSchema,
  "payment.receive": v.paymentSchema,
  "payment.verify": v.correctionSchema,
  "payment.reject": v.correctionSchema,
  "payment.refund": v.refundSchema,
  "payment.reverse": v.correctionSchema,
  "expense.create": v.expenseSchema,
  "expense.settle": v.settleSchema,
  "expense.reverse": v.correctionSchema,
};
export async function execute(
  actor: Actor,
  operation: Operation,
  payload: unknown,
  key: string,
): Promise<any> {
  requireManager(actor);
  if (!schemas[operation]) throw new DomainError("Unknown operation.", 404);
  if (!/^[a-f0-9-]{36}$/i.test(key))
    throw new DomainError("A valid idempotency key is required.");
  const input = schemas[operation].parse(payload);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db().transaction(
        async (tx) => {
          const [config] = await tx
            .select()
            .from(s.settings)
            .where(eq(s.settings.id, 1))
            .for("update");
          if (!config)
            throw new DomainError("Run database migrations first.", 503);
          const [existing] = await tx
            .select()
            .from(s.commands)
            .where(eq(s.commands.key, key));
          if (existing) {
            if (
              existing.actorId !== actor.id ||
              existing.operation !== operation ||
              existing.hash !== hash
            )
              throw new DomainError(
                "This submission key was already used for different information.",
                409,
              );
            return existing.result;
          }
          await tx
            .update(s.settings)
            .set({ version: config.version + 1 })
            .where(eq(s.settings.id, 1));
          const result = await run(tx, actor, operation, input);
          await tx.insert(s.commands).values({
            key,
            actorId: actor.id,
            operation,
            hash,
            result: json(result),
          });
          return json(result);
        },
        { isolationLevel: "serializable" },
      );
    } catch (error: any) {
      const pgCode = error.code ?? error.cause?.code;
      if (pgCode === "40001" && attempt < 2) continue;
      if (pgCode === "23505")
        throw new DomainError(
          "A record with this phone number or reference already exists.",
          409,
        );
      if (pgCode === "23503")
        throw new DomainError(
          "A related record is unavailable. Refresh and try again.",
          409,
        );
      throw error;
    }
  }
  throw new DomainError("The record is busy. Please retry.", 409);
}
async function run(
  tx: Transaction,
  actor: Actor,
  operation: Operation,
  input: any,
): Promise<any> {
  switch (operation) {
    case "client.save": {
      const p = v.clientSchema.parse(input);
      const phone = normalizePhone(p.phone);
      const values = {
        name: p.name,
        phone,
        whatsapp: p.whatsapp ? normalizePhone(p.whatsapp) : phone,
        email: p.email.toLowerCase(),
        instagram: p.instagram,
        address: p.address,
        type: p.type,
        notes: p.notes,
      };
      let result;
      if (p.id) {
        const [old] = await tx
          .select()
          .from(s.customers)
          .where(eq(s.customers.id, p.id));
        if (!old) throw new DomainError("Client not found.", 404);
        version(old.version, p.version);
        [result] = await tx
          .update(s.customers)
          .set({ ...values, version: old.version + 1 })
          .where(eq(s.customers.id, p.id))
          .returning();
        await audit(tx, actor, "updated", "client", p.id, old, result);
      } else {
        const id = randomUUID();
        [result] = await tx
          .insert(s.customers)
          .values({ ...values, id, code: code("CL", id) })
          .returning();
        await audit(tx, actor, "created", "client", id, null, result);
      }
      return result;
    }
    case "service.save": {
      const p = v.serviceSchema.parse(input);
      const values = {
        name: p.name,
        category: p.category,
        description: p.description,
        priceMinor: money(p.price),
        durationMinutes: p.durationMinutes,
        estimatedCostMinor: money(p.estimatedCost),
        active: p.active,
      };
      let result;
      if (p.id) {
        const [old] = await tx
          .select()
          .from(s.services)
          .where(eq(s.services.id, p.id));
        if (!old) throw new DomainError("Service not found.", 404);
        version(old.version, p.version);
        [result] = await tx
          .update(s.services)
          .set({ ...values, version: old.version + 1 })
          .where(eq(s.services.id, p.id))
          .returning();
        await audit(tx, actor, "updated", "service", p.id, old, result);
      } else {
        const id = randomUUID();
        [result] = await tx
          .insert(s.services)
          .values({ ...values, id, code: code("SV", id) })
          .returning();
        await audit(tx, actor, "created", "service", id, null, result);
      }
      return result;
    }
    case "booking.save": {
      const p = v.bookingSchema.parse(input);
      const [client] = await tx
        .select()
        .from(s.customers)
        .where(
          and(
            eq(s.customers.id, p.customerId),
            eq(s.customers.archived, false),
          ),
        );
      if (!client) throw new DomainError("Select an available client.");
      const items = [];
      for (const line of p.items) {
        const [svc] = await tx
          .select()
          .from(s.services)
          .where(eq(s.services.id, line.serviceId));
        if (!svc || !svc.active)
          throw new DomainError("Choose an active service.");
        const unitPriceMinor = money(line.price);
        items.push({
          serviceId: svc.id,
          name: svc.name,
          category: svc.category,
          unitPriceMinor,
          quantity: line.quantity,
          lineTotalMinor: unitPriceMinor * line.quantity,
          estimatedCostMinor: svc.estimatedCostMinor * line.quantity,
        });
      }
      const subtotalMinor = items.reduce((a, l) => a + l.lineTotalMinor, 0);
      const discountMinor = money(p.discount);
      if (discountMinor > subtotalMinor)
        throw new DomainError("Discount cannot exceed the service total.");
      const totalMinor = subtotalMinor - discountMinor;
      if (totalMinor <= 0 || totalMinor > 1e12)
        throw new DomainError(
          "Booking total must be positive and below PKR 10 billion.",
        );
      const values = {
        customerId: p.customerId,
        appointmentDate: p.appointmentDate,
        appointmentTime: p.appointmentTime,
        category: p.category,
        artist: p.artist,
        hairstylist: p.hairstylist,
        notes: p.notes,
        subtotalMinor,
        discountMinor,
        totalMinor,
      };
      let result;
      if (p.id) {
        const { b, ps, balance } = await booking(tx, p.id);
        version(b.version, p.version);
        if (["completed", "cancelled", "no_show"].includes(b.status))
          throw new DomainError(
            "Closed booking invoices cannot be edited. Use refunds or payment corrections.",
          );
        if (ps.length && p.customerId !== b.customerId)
          throw new DomainError(
            "A booking with payment history cannot be moved to another client.",
          );
        if (!p.reason || p.reason.trim().length < 5)
          throw new DomainError("Explain why the booking is being changed.");
        if (totalMinor < balance.collected)
          throw new DomainError(
            "New total is below money already received. Refund the difference first.",
          );
        const beforeItems = await tx
          .select()
          .from(s.bookingItems)
          .where(eq(s.bookingItems.bookingId, b.id));
        await tx
          .delete(s.bookingItems)
          .where(eq(s.bookingItems.bookingId, b.id));
        [result] = await tx
          .update(s.bookings)
          .set({ ...values, version: b.version + 1 })
          .where(eq(s.bookings.id, b.id))
          .returning();
        await tx
          .insert(s.bookingItems)
          .values(items.map((i) => ({ ...i, bookingId: b.id })));
        await audit(
          tx,
          actor,
          "updated",
          "booking",
          b.id,
          { ...b, items: beforeItems },
          { ...result, items },
          p.reason,
        );
      } else {
        const id = randomUUID();
        [result] = await tx
          .insert(s.bookings)
          .values({
            ...values,
            id,
            status: p.initialStatus,
            code: code("SB", id),
          })
          .returning();
        await tx
          .insert(s.bookingItems)
          .values(items.map((i) => ({ ...i, bookingId: id })));
        await audit(tx, actor, "created", "booking", id, null, {
          ...result,
          items,
        });
      }
      return result;
    }
    case "booking.status": {
      const p = v.statusSchema.parse(input);
      const { b, ps, balance } = await booking(tx, p.id);
      version(b.version, p.version);
      const transitions: Record<string, string[]> = {
        inquiry: ["confirmed", "cancelled", "no_show"],
        confirmed: [
          "inquiry",
          "in_progress",
          "completed",
          "cancelled",
          "no_show",
        ],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
        no_show: [],
      };
      if (!transitions[b.status].includes(p.status))
        throw new DomainError("This status change is not permitted.");
      financialDate(p.date);
      if (
        ["cancelled", "no_show"].includes(p.status) &&
        (!p.reason || p.reason.length < 5)
      )
        throw new DomainError(
          "A reason is required to close a booking without service.",
        );
      if (p.status === "completed") {
        if (p.date < b.appointmentDate)
          throw new DomainError(
            "Completion cannot be before the appointment. Update the appointment date if needed.",
          );
        const latest = ps
          .filter((p) => p.status === "posted")
          .map((p) => p.date)
          .sort()
          .at(-1);
        if (latest && p.date < latest)
          throw new DomainError(
            "Complete on or after the latest posted payment date. For historical entry, record completion before later receipts.",
          );
        await journal(
          tx,
          actor,
          p.date,
          "booking",
          b.id,
          "completed",
          `Services completed: ${b.code}`,
          [
            {
              accountCode: "RECEIVABLES",
              amountMinor: b.totalMinor - balance.collected,
              bookingId: b.id,
            },
            {
              accountCode: "ADVANCES",
              amountMinor: balance.collected,
              bookingId: b.id,
            },
            {
              accountCode: "REVENUE",
              amountMinor: -b.totalMinor,
              bookingId: b.id,
            },
          ],
        );
      }
      const [result] = await tx
        .update(s.bookings)
        .set({
          status: p.status,
          version: b.version + 1,
          ...(p.status === "completed" ? { completedDate: p.date } : {}),
          ...(["cancelled", "no_show"].includes(p.status)
            ? { cancelReason: p.reason }
            : {}),
        })
        .where(eq(s.bookings.id, b.id))
        .returning();
      await audit(
        tx,
        actor,
        "status_changed",
        "booking",
        b.id,
        b,
        result,
        p.reason,
      );
      return result;
    }
    case "payment.receive": {
      const p = v.paymentSchema.parse(input);
      const { b, balance } = await booking(tx, p.bookingId);
      activeBooking(b.status);
      bookingDate(b, p.date);
      const amountMinor = money(p.amount);
      if (amountMinor <= 0)
        throw new DomainError("Payment must be greater than zero.");
      if (amountMinor > balance.outstanding)
        throw new DomainError(
          "Payment exceeds the outstanding balance. Check the amount.",
        );
      const id = randomUUID();
      const [result] = await tx
        .insert(s.payments)
        .values({
          id,
          code: code("RC", id),
          bookingId: b.id,
          kind: "receipt",
          status: p.verified ? "posted" : "unverified",
          amountMinor,
          signedMinor: p.verified ? amountMinor : 0,
          creditMinor: 0,
          method: p.method,
          date: p.date,
          reference: p.reference,
          notes: p.notes,
          createdBy: actor.id,
        })
        .returning();
      if (p.verified) await receiptLedger(tx, actor, result, b);
      await audit(
        tx,
        actor,
        p.verified ? "received" : "reported_unverified",
        "payment",
        id,
        null,
        result,
      );
      return result;
    }
    case "payment.verify": {
      const p = v.correctionSchema.parse(input);
      const [old] = await tx
        .select()
        .from(s.payments)
        .where(eq(s.payments.id, p.id));
      if (!old || old.status !== "unverified")
        throw new DomainError("Only an unverified receipt can be verified.");
      const { b, balance } = await booking(tx, old.bookingId);
      activeBooking(b.status);
      bookingDate(b, old.date);
      if (old.amountMinor > balance.outstanding)
        throw new DomainError(
          "This reported receipt would overpay the booking. It has not been posted.",
        );
      const [result] = await tx
        .update(s.payments)
        .set({ status: "posted", signedMinor: old.amountMinor })
        .where(eq(s.payments.id, old.id))
        .returning();
      await receiptLedger(tx, actor, result, b);
      await audit(
        tx,
        actor,
        "verified",
        "payment",
        old.id,
        old,
        result,
        p.reason,
      );
      return result;
    }
    case "payment.reject": {
      const p = v.correctionSchema.parse(input);
      const [old] = await tx
        .select()
        .from(s.payments)
        .where(eq(s.payments.id, p.id));
      if (!old || old.status !== "unverified")
        throw new DomainError("Only an unverified receipt can be rejected.");
      const [result] = await tx
        .update(s.payments)
        .set({ status: "rejected", reason: p.reason })
        .where(eq(s.payments.id, old.id))
        .returning();
      await audit(
        tx,
        actor,
        "rejected",
        "payment",
        old.id,
        old,
        result,
        p.reason,
      );
      return result;
    }
    case "payment.refund": {
      const p = v.refundSchema.parse(input);
      const [source] = await tx
        .select()
        .from(s.payments)
        .where(eq(s.payments.id, p.paymentId));
      if (!source || source.kind !== "receipt" || source.status !== "posted")
        throw new DomainError("Select a posted receipt to refund.");
      const { b, ps, balance } = await booking(tx, source.bookingId);
      bookingDate(b, p.date);
      if (p.date < source.date)
        throw new DomainError("Refund cannot be before the receipt.");
      if (ps.some((p) => p.reversalOfId === source.id))
        throw new DomainError("This receipt was reversed.");
      const refunded = ps
        .filter(
          (p) =>
            p.parentId === source.id &&
            p.kind === "refund" &&
            !ps.some((r) => r.reversalOfId === p.id),
        )
        .reduce((a, p) => a + p.amountMinor, 0);
      const amountMinor = money(p.amount);
      if (
        amountMinor <= 0 ||
        amountMinor > source.amountMinor - refunded ||
        amountMinor > balance.collected
      )
        throw new DomainError("Refund exceeds the refundable amount.");
      const id = randomUUID();
      const creditMinor = b.status === "completed" ? amountMinor : 0;
      const [result] = await tx
        .insert(s.payments)
        .values({
          id,
          code: code("RF", id),
          bookingId: b.id,
          kind: "refund",
          status: "posted",
          amountMinor,
          signedMinor: -amountMinor,
          creditMinor,
          method: p.method,
          date: p.date,
          parentId: source.id,
          reason: p.reason,
          createdBy: actor.id,
        })
        .returning();
      await journal(
        tx,
        actor,
        p.date,
        "payment",
        id,
        "refund",
        `Refund ${result.code}`,
        [
          {
            accountCode: creditMinor ? "SALES_RETURNS" : "ADVANCES",
            amountMinor,
            bookingId: b.id,
          },
          {
            accountCode: methodAccount[p.method],
            amountMinor: -amountMinor,
            bookingId: b.id,
          },
        ],
      );
      await audit(tx, actor, "refunded", "payment", id, null, result, p.reason);
      return result;
    }
    case "payment.reverse": {
      const p = v.correctionSchema.parse(input);
      const [source] = await tx
        .select()
        .from(s.payments)
        .where(eq(s.payments.id, p.id));
      if (!source || source.status !== "posted" || source.kind === "reversal")
        throw new DomainError("Select a posted receipt or refund to reverse.");
      const { b, ps, balance } = await booking(tx, source.bookingId);
      bookingDate(b, p.date);
      if (p.date < source.date)
        throw new DomainError(
          "Correction cannot predate the original transaction.",
        );
      if (ps.some((r) => r.reversalOfId === source.id))
        throw new DomainError("This transaction has already been reversed.");
      if (
        source.kind === "receipt" &&
        ps.some(
          (p) =>
            p.parentId === source.id &&
            p.kind === "refund" &&
            !ps.some((r) => r.reversalOfId === p.id),
        )
      )
        throw new DomainError(
          "Reverse the linked refunds before reversing this receipt.",
        );
      if (
        source.kind === "refund" &&
        balance.collected + source.amountMinor >
          b.totalMinor - (balance.credits - source.creditMinor)
      )
        throw new DomainError(
          "Reversing this refund would create an overpayment.",
        );
      const id = randomUUID();
      const signedMinor = -source.signedMinor;
      const [result] = await tx
        .insert(s.payments)
        .values({
          id,
          code: code("RV", id),
          bookingId: b.id,
          kind: "reversal",
          status: "posted",
          amountMinor: source.amountMinor,
          signedMinor,
          creditMinor: -source.creditMinor,
          method: source.method,
          date: p.date,
          reversalOfId: source.id,
          reason: p.reason,
          createdBy: actor.id,
        })
        .returning();
      const contra = source.creditMinor
        ? "SALES_RETURNS"
        : b.status === "completed"
          ? "RECEIVABLES"
          : "ADVANCES";
      await journal(
        tx,
        actor,
        p.date,
        "payment",
        id,
        "correction",
        `Correction of ${source.code}`,
        [
          {
            accountCode: methodAccount[source.method],
            amountMinor: signedMinor,
            bookingId: b.id,
          },
          { accountCode: contra, amountMinor: -signedMinor, bookingId: b.id },
        ],
      );
      await audit(
        tx,
        actor,
        "reversed",
        "payment",
        source.id,
        source,
        result,
        p.reason,
      );
      return result;
    }
    case "expense.create": {
      const p = v.expenseSchema.parse(input);
      financialDate(p.date);
      const amountMinor = money(p.amount);
      if (amountMinor <= 0)
        throw new DomainError("Expense amount must be positive.");
      if (p.bookingId) await booking(tx, p.bookingId);
      if (p.classification === "direct" && !p.bookingId)
        throw new DomainError("Link a direct cost to its booking.");
      if (p.classification !== "direct" && p.bookingId)
        throw new DomainError(
          "Only direct costs should be linked to a booking.",
        );
      const id = randomUUID();
      const [result] = await tx
        .insert(s.expenses)
        .values({
          id,
          code: code("EX", id),
          date: p.date,
          category: p.category,
          classification: p.classification,
          amountMinor,
          payee: p.payee,
          description: p.description,
          method: p.paid ? p.method : null,
          bookingId: p.bookingId || null,
          paid: p.paid,
          paidDate: p.paid ? p.date : null,
          notes: p.notes,
          createdBy: actor.id,
        })
        .returning();
      await journal(
        tx,
        actor,
        p.date,
        "expense",
        id,
        "recorded",
        p.description,
        [
          {
            accountCode:
              p.classification === "capital"
                ? "EQUIPMENT"
                : p.classification === "direct"
                  ? "DIRECT_COST"
                  : "OVERHEAD",
            amountMinor,
            bookingId: p.bookingId || undefined,
          },
          {
            accountCode: p.paid ? methodAccount[p.method] : "PAYABLES",
            amountMinor: -amountMinor,
            bookingId: p.bookingId || undefined,
          },
        ],
      );
      await audit(tx, actor, "created", "expense", id, null, result);
      return result;
    }
    case "expense.settle": {
      const p = v.settleSchema.parse(input);
      financialDate(p.date);
      const [old] = await tx
        .select()
        .from(s.expenses)
        .where(eq(s.expenses.id, p.id));
      if (!old || old.paid || old.voided)
        throw new DomainError("Select an unpaid, active expense.");
      if (p.date < old.date)
        throw new DomainError("Payment cannot predate the expense.");
      const [result] = await tx
        .update(s.expenses)
        .set({ paid: true, paidDate: p.date, method: p.method })
        .where(eq(s.expenses.id, old.id))
        .returning();
      await journal(
        tx,
        actor,
        p.date,
        "expense",
        old.id,
        "settled",
        `Settled ${old.code}`,
        [
          { accountCode: "PAYABLES", amountMinor: old.amountMinor },
          {
            accountCode: methodAccount[p.method],
            amountMinor: -old.amountMinor,
          },
        ],
      );
      await audit(tx, actor, "settled", "expense", old.id, old, result);
      return result;
    }
    case "expense.reverse": {
      const p = v.correctionSchema.parse(input);
      financialDate(p.date);
      const [old] = await tx
        .select()
        .from(s.expenses)
        .where(eq(s.expenses.id, p.id));
      if (!old || old.voided)
        throw new DomainError(
          "This expense is unavailable or already reversed.",
        );
      if (p.date < (old.paidDate ?? old.date))
        throw new DomainError(
          "Correction cannot predate the expense or its settlement.",
        );
      const [result] = await tx
        .update(s.expenses)
        .set({ voided: true })
        .where(eq(s.expenses.id, old.id))
        .returning();
      await journal(
        tx,
        actor,
        p.date,
        "expense",
        old.id,
        "reversed",
        `Reversed ${old.code}`,
        [
          {
            accountCode:
              old.classification === "capital"
                ? "EQUIPMENT"
                : old.classification === "direct"
                  ? "DIRECT_COST"
                  : "OVERHEAD",
            amountMinor: -old.amountMinor,
            bookingId: old.bookingId || undefined,
          },
          {
            accountCode: old.paid ? methodAccount[old.method!] : "PAYABLES",
            amountMinor: old.amountMinor,
            bookingId: old.bookingId || undefined,
          },
        ],
      );
      await audit(
        tx,
        actor,
        "reversed",
        "expense",
        old.id,
        old,
        result,
        p.reason,
      );
      return result;
    }
  }
}
