import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { bookingBalance, dayOf, addDays, type Actor } from "@/lib/domain";
export async function snapshot(actor: Actor) {
  return db().transaction(
    async (tx) => {
      const [
        config,
        customers,
        services,
        rawBookings,
        items,
        payments,
        expenses,
        journals,
        lines,
        audit,
        users,
        attachments,
      ] = await Promise.all([
        tx.select().from(s.settings),
        tx.select().from(s.customers).orderBy(desc(s.customers.createdAt)),
        tx
          .select()
          .from(s.services)
          .orderBy(s.services.category, s.services.name),
        tx.select().from(s.bookings).orderBy(desc(s.bookings.appointmentDate)),
        tx.select().from(s.bookingItems),
        tx.select().from(s.payments).orderBy(desc(s.payments.createdAt)),
        tx.select().from(s.expenses).orderBy(desc(s.expenses.date)),
        tx.select().from(s.journals),
        tx.select().from(s.ledgerLines),
        tx
          .select()
          .from(s.auditLogs)
          .orderBy(desc(s.auditLogs.createdAt))
          .limit(200),
        tx
          .select({
            id: s.users.id,
            name: s.users.name,
            email: s.users.email,
            role: s.users.role,
          })
          .from(s.users),
        tx
          .select({
            id: s.attachments.id,
            entity: s.attachments.entity,
            entityId: s.attachments.entityId,
            name: s.attachments.name,
            size: s.attachments.size,
          })
          .from(s.attachments),
      ]);
      const ledger = lines.map((l) => ({
        ...l,
        ...journals.find((j) => j.id === l.journalId),
        id: l.id,
      }));
      const bookings = rawBookings.map((b) => {
        const ps = payments.filter((p) => p.bookingId === b.id);
        const client = customers.find((c) => c.id === b.customerId);
        return {
          ...b,
          clientName: client?.name ?? "Unknown client",
          clientPhone: client?.phone ?? "",
          items: items.filter((i) => i.bookingId === b.id),
          payments: ps,
          ...bookingBalance(b, ps),
          directCostMinor: ledger
            .filter(
              (l) => l.bookingId === b.id && l.accountCode === "DIRECT_COST",
            )
            .reduce((a, l) => a + l.amountMinor, 0),
        };
      });
      return JSON.parse(
        JSON.stringify({
          config: config[0],
          actor,
          customers,
          services,
          bookings,
          payments,
          expenses,
          ledger,
          audit,
          users,
          attachments,
        }),
      );
    },
    { isolationLevel: "repeatable read" },
  );
}
export { summary, reportRows, REPORTS } from "@/lib/reporting";
export type { Snapshot, Summary, ReportKind } from "@/lib/reporting";
