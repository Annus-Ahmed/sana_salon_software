import { dayOf, addDays, allocateMinor, type Actor } from "./domain";
export type Snapshot = {
  config: { name: string; demo: boolean };
  actor: Actor;
  customers: any[];
  services: any[];
  bookings: any[];
  payments: any[];
  expenses: any[];
  ledger: any[];
  audit: any[];
  users: any[];
  attachments: any[];
};
export function summary(data: Snapshot, from: string, to: string) {
  const within = (d: string) => d >= from && d <= to;
  const lines = data.ledger.filter((l) => within(l.date));
  const account = (code: string) =>
    lines
      .filter((l) => l.accountCode === code)
      .reduce((a, l) => a + l.amountMinor, 0);
  const grossEarned = -account("REVENUE");
  const creditNotes = account("SALES_RETURNS");
  const revenue = grossEarned - creditNotes;
  const directCosts = account("DIRECT_COST"),
    overheads = account("OVERHEAD");
  const movements = data.payments.filter(
    (p) => p.status === "posted" && within(p.date),
  );
  const collected = movements.reduce((a, p) => a + p.signedMinor, 0);
  const cashCollected = movements
    .filter((p) => p.method === "Cash")
    .reduce((a, p) => a + p.signedMinor, 0);
  const currentReceivables = data.bookings.reduce(
    (a, b) => a + b.outstanding,
    0,
  );
  const currentAdvances = data.bookings.reduce((a, b) => a + b.advance, 0);
  const timeline = [];
  let cursor = from;
  while (cursor <= to && timeline.length < 367) {
    const dayLines = lines.filter((l) => l.date === cursor);
    const sum = (code: string) =>
      dayLines
        .filter((l) => l.accountCode === code)
        .reduce((a, l) => a + l.amountMinor, 0);
    timeline.push({
      date: cursor,
      label: cursor.slice(5),
      revenue: -sum("REVENUE") - sum("SALES_RETURNS"),
      expenses: sum("DIRECT_COST") + sum("OVERHEAD"),
      collected: movements
        .filter((p) => p.date === cursor)
        .reduce((a, p) => a + p.signedMinor, 0),
      bookings: data.bookings.filter((b) => b.appointmentDate === cursor)
        .length,
    });
    cursor = addDays(cursor, 1);
  }
  const earnedBookings = data.bookings.filter(
    (b) => b.completedDate && within(b.completedDate),
  );
  const categories: Record<string, number> = {};
  const serviceRows: Record<
    string,
    { name: string; category: string; quantity: number; revenue: number }
  > = {};
  for (const b of earnedBookings) {
    const allocations = allocateMinor(
      b.totalMinor,
      b.items.map((i: any) => i.lineTotalMinor),
    );
    for (const [index, i] of b.items.entries()) {
      const allocated = allocations[index];
      categories[i.category] = (categories[i.category] ?? 0) + allocated;
      const key = i.serviceId;
      serviceRows[key] ??= {
        name: i.name,
        category: i.category,
        quantity: 0,
        revenue: 0,
      };
      serviceRows[key].quantity += i.quantity;
      serviceRows[key].revenue += allocated;
    }
  }
  const balances: Record<string, number> = {};
  for (const l of data.ledger.filter((l) => l.date <= to))
    balances[l.accountCode] = (balances[l.accountCode] ?? 0) + l.amountMinor;
  return {
    from,
    to,
    grossEarned,
    creditNotes,
    revenue,
    directCosts,
    overheads,
    expenses: directCosts + overheads,
    profit: revenue - directCosts - overheads,
    collected,
    cashCollected,
    digitalCollected: collected - cashCollected,
    currentReceivables,
    currentAdvances,
    bookingValue: data.bookings
      .filter((b) => within(dayOf(b.createdAt)))
      .reduce((a, b) => a + b.totalMinor, 0),
    bookingsCreated: data.bookings.filter((b) => within(dayOf(b.createdAt)))
      .length,
    completed: earnedBookings.length,
    upcoming: data.bookings.filter(
      (b) =>
        ["confirmed", "in_progress"].includes(b.status) &&
        b.appointmentDate >= to,
    ).length,
    unverified: data.payments.filter((p) => p.status === "unverified").length,
    unpaidExpenses: -Math.min(0, balances.PAYABLES ?? 0),
    cashBalance: balances.CASH ?? 0,
    capitalPurchases: account("EQUIPMENT"),
    timeline,
    categories: Object.entries(categories).map(([name, value]) => ({
      name,
      value,
    })),
    serviceRows: Object.values(serviceRows),
    balances,
  };
}
export type Summary = ReturnType<typeof summary>;
export const REPORTS = {
  sales: "Earned revenue",
  collections: "Customer payments",
  receivables: "Outstanding payments",
  expenses: "Expenses",
  services: "Service performance",
  bookings: "Booking contribution",
  profit: "Profit & loss",
  ledger: "General ledger",
  clients: "Client directory",
} as const;
export type ReportKind = keyof typeof REPORTS;
export function reportRows(
  data: Snapshot,
  kind: ReportKind,
  from: string,
  to: string,
): Record<string, unknown>[] {
  const r = summary(data, from, to);
  const within = (d: string) => d >= from && d <= to;
  const major = (v: number) => v / 100;
  switch (kind) {
    case "clients":
      return data.customers.map((c) => ({
        "Client ID": c.code,
        Name: c.name,
        Phone: c.phone,
        Email: c.email,
        Type: c.type,
        Registered: dayOf(c.createdAt),
      }));
    case "sales":
      return r.timeline.map((d) => ({
        Date: d.date,
        "Earned revenue PKR": major(d.revenue),
        "Operating expenses PKR": major(d.expenses),
        "Net collections PKR": major(d.collected),
      }));
    case "collections":
      return data.payments
        .filter((p) => within(p.date))
        .map((p) => ({
          "Receipt ID": p.code,
          Date: p.date,
          Booking: data.bookings.find((b) => b.id === p.bookingId)?.code,
          Kind: p.kind,
          Status: p.status,
          Method: p.method,
          "Amount PKR": major(p.amountMinor),
          "Signed collected PKR": major(p.signedMinor),
          Reference: p.reference,
          Reason: p.reason,
        }));
    case "receivables":
      return data.bookings
        .filter((b) => b.outstanding > 0)
        .map((b) => ({
          Booking: b.code,
          Client: b.clientName,
          Date: b.appointmentDate,
          Status: b.status,
          "Net invoice PKR": major(b.billed),
          "Net paid PKR": major(b.collected),
          "Outstanding PKR": major(b.outstanding),
        }));
    case "expenses":
      return data.expenses
        .filter((e) => within(e.date))
        .map((e) => ({
          "Expense ID": e.code,
          Date: e.date,
          Category: e.category,
          Classification: e.classification,
          "Paid to": e.payee,
          Description: e.description,
          "Amount PKR": major(e.amountMinor),
          Status: e.voided ? "Reversed" : e.paid ? "Paid" : "Unpaid",
          Method: e.method,
        }));
    case "services":
      return r.serviceRows.map((i) => ({
        Service: i.name,
        Category: i.category,
        Quantity: i.quantity,
        "Discounted earned value PKR": major(i.revenue),
        Note: "Before later credit notes; actual costs are reported per booking.",
      }));
    case "bookings":
      return data.bookings
        .filter((b) => b.completedDate && within(b.completedDate))
        .map((b) => ({
          Booking: b.code,
          Client: b.clientName,
          Completed: b.completedDate,
          "Revenue after all credits PKR": major(b.billed),
          "Recorded direct costs PKR": major(b.directCostMinor),
          "Contribution PKR": major(b.billed - b.directCostMinor),
          "Margin %": b.billed
            ? Math.round(((b.billed - b.directCostMinor) / b.billed) * 10000) /
              100
            : 0,
        }));
    case "profit":
      return [
        { Line: "Gross service revenue", PKR: major(r.grossEarned) },
        { Line: "Less refunds / credit notes", PKR: major(r.creditNotes) },
        { Line: "Net earned revenue", PKR: major(r.revenue) },
        { Line: "Direct costs", PKR: major(r.directCosts) },
        { Line: "Overheads", PKR: major(r.overheads) },
        {
          Line: "Operating profit before depreciation and tax",
          PKR: major(r.profit),
        },
        {
          Line: "Capital purchases (excluded from expenses)",
          PKR: major(r.capitalPurchases),
        },
      ];
    case "ledger":
      return data.ledger
        .filter((l) => within(l.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => ({
          Date: l.date,
          Journal: l.journalId,
          Account: l.accountCode,
          Description: l.description,
          "Debit PKR": major(Math.max(0, l.amountMinor)),
          "Credit PKR": major(Math.max(0, -l.amountMinor)),
          Source: l.sourceType,
          "Record ID": l.sourceId,
        }));
  }
}
