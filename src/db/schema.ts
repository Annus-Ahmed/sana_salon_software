import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  bigint,
  boolean,
  date,
  jsonb,
  customType,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) =>
  bigint(name, { mode: "number" }).notNull().default(0);
const bytes = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  demo: boolean("demo").notNull(),
  version: integer("version").notNull().default(1),
});
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"finance_manager" | "owner">().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});
export const customers = pgTable(
  "customers",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone").notNull().unique(),
    whatsapp: text("whatsapp"),
    email: text("email"),
    instagram: text("instagram"),
    address: text("address"),
    type: text("type").notNull().default("Individual"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("customer_name_idx").on(t.name)],
);
export const services = pgTable("services", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  priceMinor: money("price_minor"),
  durationMinutes: integer("duration_minutes").notNull(),
  estimatedCostMinor: money("estimated_cost_minor"),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: created(),
});
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    code: text("code").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    appointmentDate: date("appointment_date").notNull(),
    appointmentTime: text("appointment_time").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("confirmed"),
    artist: text("artist"),
    hairstylist: text("hairstylist"),
    notes: text("notes"),
    subtotalMinor: money("subtotal_minor"),
    discountMinor: money("discount_minor"),
    totalMinor: money("total_minor"),
    version: integer("version").notNull().default(1),
    completedDate: date("completed_date"),
    cancelReason: text("cancel_reason"),
    createdAt: created(),
  },
  (t) => [
    index("booking_customer_idx").on(t.customerId),
    index("booking_appointment_idx").on(t.appointmentDate),
    index("booking_status_idx").on(t.status),
  ],
);
export const bookingItems = pgTable(
  "booking_items",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unitPriceMinor: money("unit_price_minor"),
    quantity: integer("quantity").notNull(),
    lineTotalMinor: money("line_total_minor"),
    estimatedCostMinor: money("estimated_cost_minor"),
  },
  (t) => [index("booking_item_idx").on(t.bookingId)],
);
export const payments = pgTable(
  "payments",
  {
    id: id(),
    code: text("code").notNull().unique(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"receipt" | "refund" | "reversal">().notNull(),
    status: text("status")
      .$type<"unverified" | "posted" | "rejected">()
      .notNull(),
    amountMinor: money("amount_minor"),
    signedMinor: money("signed_minor"),
    creditMinor: money("credit_minor"),
    method: text("method").notNull(),
    date: date("date").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    reason: text("reason"),
    parentId: uuid("parent_id").references((): AnyPgColumn => payments.id, {
      onDelete: "restrict",
    }),
    reversalOfId: uuid("reversal_of_id")
      .unique()
      .references((): AnyPgColumn => payments.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: created(),
  },
  (t) => [
    index("payment_booking_idx").on(t.bookingId),
    index("payment_date_idx").on(t.date),
  ],
);
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    code: text("code").notNull().unique(),
    date: date("date").notNull(),
    category: text("category").notNull(),
    classification: text("classification")
      .$type<"overhead" | "direct" | "capital">()
      .notNull(),
    amountMinor: money("amount_minor"),
    payee: text("payee").notNull(),
    description: text("description").notNull(),
    method: text("method"),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "restrict",
    }),
    paid: boolean("paid").notNull(),
    paidDate: date("paid_date"),
    voided: boolean("voided").notNull().default(false),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: created(),
  },
  (t) => [
    index("expense_date_idx").on(t.date),
    index("expense_booking_idx").on(t.bookingId),
  ],
);
export const accounts = pgTable("accounts", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
});
export const journals = pgTable(
  "journals",
  {
    id: id(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    event: text("event").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("journal_source_event_idx").on(
      t.sourceType,
      t.sourceId,
      t.event,
    ),
    index("journal_date_idx").on(t.date),
  ],
);
export const ledgerLines = pgTable(
  "ledger_lines",
  {
    id: id(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => journals.id, { onDelete: "restrict" }),
    accountCode: text("account_code")
      .notNull()
      .references(() => accounts.code, { onDelete: "restrict" }),
    amountMinor: money("amount_minor"),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    index("ledger_account_idx").on(t.accountCode),
    index("ledger_journal_idx").on(t.journalId),
  ],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: created(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_time_idx").on(t.createdAt),
  ],
);
export const commands = pgTable("commands", {
  key: uuid("key").primaryKey(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  operation: text("operation").notNull(),
  hash: text("hash").notNull(),
  result: jsonb("result").notNull(),
  createdAt: created(),
});
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytes("data").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: created(),
  },
  (t) => [index("attachment_entity_idx").on(t.entity, t.entityId)],
);
