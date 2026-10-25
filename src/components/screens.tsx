"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  WalletCards,
  ChartNoAxesCombined,
  ArrowDownToLine,
  ReceiptText,
  Coins,
  Check,
  Search,
  Clock3,
  MoreHorizontal,
  Pencil,
  Printer,
  ArrowLeft,
  ShieldCheck,
  FileText,
  Paperclip,
  Undo2,
  Info,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import {
  Money,
  Badge,
  PageHeading,
  DataTable,
  SearchBox,
  Modal,
  Empty,
} from "./ui";
import {
  RecordForm,
  ActionForm,
  type ActionSpec,
  type FormKind,
} from "./forms";
import { RevenueChart, CategoryChart } from "./charts";
import { today, addDays, dayOf, formatMoney, STATUSES } from "@/lib/domain";
import { summary, reportRows, REPORTS, type ReportKind } from "@/lib/reporting";
const isOpen = (b: any) => !["cancelled", "no_show"].includes(b.status);
function dateLabel(d: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(d + "T12:00:00Z"));
}
function useRange() {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
}
type Range = ReturnType<typeof useRange>;
function DateFilter({ range }: { range: Range }) {
  return (
    <div className="date-filter">
      <CalendarDays size={15} />
      <select
        aria-label="Date range preset"
        defaultValue="month"
        onChange={(e) => {
          const t = today();
          range.setTo(t);
          switch (e.target.value) {
            case "today":
              range.setFrom(t);
              break;
            case "yesterday":
              range.setFrom(addDays(t, -1));
              range.setTo(addDays(t, -1));
              break;
            case "week":
              range.setFrom(addDays(t, -6));
              break;
            case "lastmonth": {
              const first = t.slice(0, 7) + "-01";
              const end = addDays(first, -1);
              range.setFrom(end.slice(0, 7) + "-01");
              range.setTo(end);
              break;
            }
            case "month":
              range.setFrom(t.slice(0, 7) + "-01");
              break;
          }
        }}
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="week">Last 7 days</option>
        <option value="month">This month</option>
        <option value="lastmonth">Last month</option>
        <option value="custom">Custom range</option>
      </select>
      <input
        aria-label="From date"
        type="date"
        value={range.from}
        min={addDays(range.to, -365)}
        max={range.to}
        onChange={(e) => {
          if (e.target.value)
            range.setFrom(
              e.target.value < addDays(range.to, -365)
                ? addDays(range.to, -365)
                : e.target.value > range.to
                  ? range.to
                  : e.target.value,
            );
        }}
      />
      <span>to</span>
      <input
        aria-label="To date"
        type="date"
        min={range.from}
        max={addDays(range.from, 365)}
        value={range.to}
        onChange={(e) => {
          if (e.target.value)
            range.setTo(
              e.target.value > addDays(range.from, 365)
                ? addDays(range.from, 365)
                : e.target.value < range.from
                  ? range.from
                  : e.target.value,
            );
        }}
      />
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  Icon = Coins,
  tone = "",
}: {
  label: string;
  value: number;
  note: string;
  Icon?: any;
  tone?: string;
}) {
  return (
    <div className={"stat-card " + tone}>
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">
          <Icon size={17} />
        </div>
      </div>
      <div className="stat-value">
        <Money value={value} />
      </div>
      <div className="stat-note">
        <span className="tiny-line" />
        {note}
      </div>
    </div>
  );
}
export function Screen({ section, id }: { section: string; id?: string }) {
  const { actor, data } = useWorkspace();
  const d = data!;
  const canWrite = actor.role === "finance_manager";
  const [form, setForm] = useState<{ kind: FormKind; record?: any } | null>(
      null,
    ),
    [action, setAction] = useState<ActionSpec | null>(null),
    [client, setClient] = useState<any>(null);
  const open = (kind: FormKind, record?: any) => setForm({ kind, record });
  const paymentActions = (p: any) => {
    const reversed = d.payments.some((r) => r.reversalOfId === p.id);
    if (!canWrite || reversed || p.kind === "reversal")
      return reversed ? <span className="muted small">Reversed</span> : null;
    if (p.status === "rejected")
      return <span className="muted small">Rejected</span>;
    if (p.status === "unverified")
      return (
        <div className="row-actions">
          <button
            className="text-btn"
            onClick={() =>
              setAction({
                title: "Verify this payment",
                description:
                  "This posts the receipt on its original transaction date.",
                endpoint: "payments/verify",
                input: { id: p.id, date: today() },
                fields: ["reason"],
              })
            }
          >
            <ShieldCheck size={14} />
            Verify
          </button>
          <button
            className="text-btn danger-text"
            onClick={() =>
              setAction({
                title: "Reject this reported payment",
                description:
                  "The report is retained without changing client balances or the ledger.",
                endpoint: "payments/reject",
                input: { id: p.id, date: today() },
                fields: ["reason"],
              })
            }
          >
            Reject
          </button>
        </div>
      );
    return (
      <div className="row-actions">
        {p.kind === "receipt" && (
          <button
            className="text-btn"
            onClick={() =>
              setAction({
                title: "Refund a payment",
                description:
                  "A completed service refund also creates a revenue credit note.",
                endpoint: "payments/refund",
                input: { paymentId: p.id, method: p.method },
                fields: ["amount", "date", "method", "reason"],
              })
            }
          >
            Refund
          </button>
        )}
        <button
          className="icon-btn"
          aria-label={"Reverse " + p.code}
          title="Reverse an incorrect entry"
          onClick={() =>
            setAction({
              title: "Reverse an incorrect payment",
              description:
                "The original record stays visible. A linked correction is posted.",
              endpoint: "payments/reverse",
              input: { id: p.id },
              fields: ["date", "reason"],
              warning:
                "Use this for a recording mistake. For money actually returned to a client, use Refund.",
            })
          }
        >
          <Undo2 size={15} />
        </button>
      </div>
    );
  };
  const paymentColumns = [
    {
      key: "code",
      label: "Transaction",
      render: (p: any) => (
        <div>
          <strong>{p.code}</strong>
          <small>{p.kind}</small>
        </div>
      ),
    },
    { key: "date", label: "Date", render: (p: any) => dateLabel(p.date) },
    {
      key: "bookingId",
      label: "Booking / Client",
      render: (p: any) => {
        const b = d.bookings.find((b) => b.id === p.bookingId);
        return (
          <Link className="table-link" href={"/bookings/" + p.bookingId}>
            {b?.clientName}
            <small>{b?.code}</small>
          </Link>
        );
      },
    },
    {
      key: "amountMinor",
      label: "Amount",
      render: (p: any) => (
        <div className={p.signedMinor < 0 ? "danger-text" : ""}>
          <Money
            value={p.status === "unverified" ? p.amountMinor : p.signedMinor}
          />
          {p.creditMinor !== 0 && <small>Includes a revenue credit note</small>}
        </div>
      ),
    },
    { key: "method", label: "Method" },
    {
      key: "status",
      label: "Status",
      render: (p: any) => <Badge value={p.status} />,
    },
    { key: "actions", label: "", render: paymentActions },
  ];
  return (
    <>
      {section === "dashboard" && (
        <Dashboard onBook={() => open("bookings")} canWrite={canWrite} />
      )}
      {section === "clients" && (
        <Clients
          onAdd={() => open("clients")}
          onEdit={(r) => open("clients", r)}
          onView={setClient}
          canWrite={canWrite}
        />
      )}
      {section === "bookings" && (
        <Bookings
          onAdd={() => open("bookings")}
          onPay={(b) => open("payments", { bookingId: b.id })}
          canWrite={canWrite}
        />
      )}
      {section === "services" && (
        <Services
          onAdd={() => open("services")}
          onEdit={(r) => open("services", r)}
          canWrite={canWrite}
        />
      )}
      {section === "payments" && (
        <Payments
          onAdd={() => open("payments")}
          columns={paymentColumns}
          canWrite={canWrite}
        />
      )}
      {section === "expenses" && (
        <Expenses
          canWrite={canWrite}
          onAdd={() => open("expenses")}
          onAction={setAction}
        />
      )}
      {section === "booking-detail" && (
        <BookingDetail
          id={id!}
          canWrite={canWrite}
          onEdit={(b) => open("bookings", b)}
          onPay={(b) => open("payments", { bookingId: b.id })}
          onAction={setAction}
          paymentColumns={paymentColumns}
        />
      )}
      {section === "reports" && <Reports />}
      {section === "audit" && <Audit />}
      {section === "settings" && <Settings />}
      {form && (
        <RecordForm
          kind={form.kind}
          record={form.record}
          onClose={() => setForm(null)}
        />
      )}{" "}
      {action && <ActionForm spec={action} onClose={() => setAction(null)} />}{" "}
      {client && (
        <ClientProfile
          client={d.customers.find((c) => c.id === client.id) ?? client}
          onClose={() => setClient(null)}
          onEdit={() => {
            setClient(null);
            open("clients", client);
          }}
          canWrite={canWrite}
        />
      )}
    </>
  );
}
function Dashboard({
  onBook,
  canWrite,
}: {
  onBook: () => void;
  canWrite: boolean;
}) {
  const { data, actor } = useWorkspace();
  const d = data!,
    range = useRange();
  const r = useMemo(
    () => summary(d, range.from, range.to),
    [d, range.from, range.to],
  );
  const [chart, setChart] = useState("revenue");
  const upcoming = d.bookings
    .filter(
      (b) =>
        ["confirmed", "in_progress"].includes(b.status) &&
        b.appointmentDate >= today(),
    )
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))
    .slice(0, 5);
  const latest = d.payments.filter((p) => p.status === "posted").slice(0, 5);
  const weekStart = addDays(
    today(),
    -((new Date(today() + "T12:00:00Z").getUTCDay() + 6) % 7),
  );
  const t = summary(d, today(), today()),
    w = summary(d, weekStart, today()),
    m = summary(d, today().slice(0, 7) + "-01", today());
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Karachi",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
          .format(new Date())
          .toUpperCase()}
        title={"Welcome back, " + actor.name.split(" ")[0] + "."}
        description="A little clarity for the beautiful business you’re building."
      >
        {canWrite && (
          <button className="btn primary" onClick={onBook}>
            <Plus size={17} />
            New booking
          </button>
        )}
      </PageHeading>
      <div className="overview-toolbar">
        <div>
          <span className="section-kicker">BUSINESS OVERVIEW</span>
          <span className="live-indicator">
            <i />
            From verified records
          </span>
        </div>
        <DateFilter range={range} />
      </div>
      <div className="stats-grid">
        <Stat
          label="Earned revenue"
          value={r.revenue}
          note="Services performed, less credit notes"
          Icon={ChartNoAxesCombined}
        />
        <Stat
          label="Money collected"
          value={r.collected}
          note="Verified receipts, less returns"
          Icon={WalletCards}
        />
        <Stat
          label="Operating profit"
          value={r.profit}
          note="Before depreciation and tax"
          Icon={Coins}
          tone="stat-featured"
        />
        <Stat
          label="Client balances"
          value={r.currentReceivables}
          note="Current open bookings, all dates"
          Icon={ReceiptText}
        />
      </div>
      <div className="quick-metrics">
        <div>
          <span>Today’s earned sales</span>
          <strong>
            <Money value={t.revenue} />
          </strong>
        </div>
        <div>
          <span>This week’s earned sales</span>
          <strong>
            <Money value={w.revenue} />
          </strong>
        </div>
        <div>
          <span>This month’s earned sales</span>
          <strong>
            <Money value={m.revenue} />
          </strong>
        </div>
        <div>
          <span>Held customer advances</span>
          <strong>
            <Money value={r.currentAdvances} />
          </strong>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>The financial picture</h2>
              <p>
                {dateLabel(range.from)} to {dateLabel(range.to)}
              </p>
            </div>
            <div className="segmented">
              {[
                ["revenue", "Revenue"],
                ["collections", "Collections"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={chart === key ? "selected" : ""}
                  onClick={() => setChart(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-legend">
            <span>
              <i className="gold" />
              {chart === "revenue" ? "Earned revenue" : "Net collections"}
            </span>
            {chart === "revenue" && (
              <span>
                <i className="sage" />
                Operating expenses
              </span>
            )}
            <small>PKR</small>
          </div>
          <RevenueChart data={r.timeline} mode={chart} />
        </section>
        <section className="panel category-panel">
          <div className="panel-head">
            <div>
              <h2>Your service mix</h2>
              <p>Discounted service value by category</p>
            </div>
            <SparkleMark />
          </div>
          <div className="category-total">
            <Money value={r.grossEarned} />
            <span>gross earned revenue</span>
          </div>
          {r.categories.length ? (
            <CategoryChart data={r.categories} />
          ) : (
            <Empty
              title="Your first chapter awaits."
              description="Complete a booking to see your service mix."
            />
          )}
          <div className="panel-foot small muted">
            Before subsequent refunds and credit notes.
          </div>
        </section>
        <section className="panel upcoming-panel">
          <div className="panel-head">
            <div>
              <h2>Next in your chair</h2>
              <p>Upcoming appointments, thoughtfully organized.</p>
            </div>
            <Link className="text-btn" href="/bookings">
              View all
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <DataTable
            pageSize={5}
            rows={upcoming}
            empty="No upcoming appointments."
            columns={[
              {
                key: "clientName",
                label: "CLIENT",
                render: (b) => (
                  <Link className="table-link" href={"/bookings/" + b.id}>
                    <span className="client-avatar">{b.clientName[0]}</span>
                    <span>
                      {b.clientName}
                      <small>{b.code}</small>
                    </span>
                  </Link>
                ),
              },
              {
                key: "appointmentDate",
                label: "APPOINTMENT",
                render: (b) => (
                  <div>
                    {dateLabel(b.appointmentDate)}
                    <small>{b.appointmentTime}</small>
                  </div>
                ),
              },
              { key: "category", label: "SERVICE" },
              {
                key: "status",
                label: "STATUS",
                render: (b) => <Badge value={b.status} />,
              },
            ]}
          />
        </section>
        <section className="panel recent-panel">
          <div className="panel-head">
            <div>
              <h2>Recent collections</h2>
              <p>Your latest verified activity.</p>
            </div>
            <Link
              href="/payments"
              className="icon-btn"
              aria-label="View payments"
            >
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="transaction-list">
            {latest.length ? (
              latest.map((p) => {
                const b = d.bookings.find((b) => b.id === p.bookingId);
                return (
                  <Link
                    href={"/bookings/" + p.bookingId}
                    key={p.id}
                    className="transaction-row"
                  >
                    <div
                      className={
                        "transaction-icon " +
                        (p.signedMinor < 0 ? "refund-icon" : "")
                      }
                    >
                      <WalletCards size={17} />
                    </div>
                    <div>
                      <strong>{b?.clientName}</strong>
                      <span>
                        {p.method} · {dateLabel(p.date)}
                      </span>
                    </div>
                    <div className="transaction-amount">
                      <Money value={p.signedMinor} />
                      <span>{p.kind}</span>
                    </div>
                  </Link>
                );
              })
            ) : (
              <Empty
                title="No collections yet."
                description="Record a verified receipt to get started."
              />
            )}
          </div>
          <Link className="panel-foot all-link" href="/payments">
            View payment records
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <div className="attention-row">
        <div>
          <CalendarDays size={19} />
          <strong>{r.completed}</strong> completed bookings in this period
        </div>
        <div>
          <ShieldCheck size={19} />
          <strong>{r.unverified}</strong> payments awaiting verification
        </div>
        <Link href="/reports">
          Explore your reports
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}
function SparkleMark() {
  return <div className="gold-icon small-icon">✧</div>;
}
function Clients({
  onAdd,
  onEdit,
  onView,
  canWrite,
}: {
  onAdd: () => void;
  onEdit: (r: any) => void;
  onView: (r: any) => void;
  canWrite: boolean;
}) {
  const { data } = useWorkspace();
  const d = data!,
    [search, setSearch] = useState(""),
    [type, setType] = useState("all");
  const rows = d.customers
    .filter(
      (c) =>
        (type === "all" || c.type === type) &&
        [c.name, c.phone, c.email, c.code]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .map((c) => {
      const bs = d.bookings.filter((b) => b.customerId === c.id);
      return {
        ...c,
        bookingsCount: bs.length,
        outstanding: bs.reduce((a, b) => a + b.outstanding, 0),
        paid: bs.reduce((a, b) => a + b.collected, 0),
      };
    });
  return (
    <>
      <PageHeading
        eyebrow="RELATIONSHIPS, REMEMBERED"
        title="Your clients"
        description="Every client, every visit, and the details that matter."
      >
        {canWrite && (
          <button className="btn primary" onClick={onAdd}>
            <Plus size={17} />
            Add client
          </button>
        )}
      </PageHeading>
      <div className="list-stats">
        <div>
          <strong>{d.customers.length}</strong>
          <span>Total clients</span>
        </div>
        <div>
          <strong>
            {
              d.customers.filter(
                (c) =>
                  d.bookings.filter(
                    (b) => b.customerId === c.id && b.status === "completed",
                  ).length > 1,
              ).length
            }
          </strong>
          <span>Returning clients</span>
        </div>
        <div>
          <strong>
            <Money value={d.bookings.reduce((a, b) => a + b.outstanding, 0)} />
          </strong>
          <span>Open booking balances</span>
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search name, phone or email…"
          />
          <select
            aria-label="Client type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {["all", "Individual", "Bride", "Model", "Brand", "Corporate"].map(
              (v) => (
                <option value={v} key={v}>
                  {v === "all" ? "All client types" : v}
                </option>
              ),
            )}
          </select>
          <a
            href="/api/exports?kind=clients&format=csv"
            className="btn small-btn"
          >
            <ArrowDownToLine size={15} />
            Export
          </a>
        </div>
        <DataTable
          rows={rows}
          columns={[
            {
              key: "name",
              label: "CLIENT",
              render: (c) => (
                <button className="client-cell" onClick={() => onView(c)}>
                  <span className="client-avatar">{c.name[0]}</span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.code}</small>
                  </span>
                </button>
              ),
            },
            {
              key: "phone",
              label: "CONTACT",
              render: (c) => (
                <div>
                  {c.phone}
                  <small>{c.email || "No email recorded"}</small>
                </div>
              ),
            },
            {
              key: "type",
              label: "TYPE",
              render: (c) => <Badge value={c.type} />,
            },
            { key: "bookingsCount", label: "BOOKINGS" },
            {
              key: "paid",
              label: "NET PAID",
              render: (c) => <Money value={c.paid} />,
            },
            {
              key: "outstanding",
              label: "OUTSTANDING",
              render: (c) => <Money value={c.outstanding} />,
            },
            {
              key: "actions",
              label: "",
              render: (c) => (
                <div className="row-actions">
                  <button className="text-btn" onClick={() => onView(c)}>
                    View
                    <ArrowUpRight size={13} />
                  </button>
                  {canWrite && (
                    <button
                      className="icon-btn"
                      aria-label={"Edit " + c.name}
                      onClick={() => onEdit(c)}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
function ClientProfile({
  client,
  onClose,
  onEdit,
  canWrite,
}: {
  client: any;
  onClose: () => void;
  onEdit: () => void;
  canWrite: boolean;
}) {
  const { data } = useWorkspace();
  const bs = data!.bookings.filter((b) => b.customerId === client.id);
  return (
    <Modal
      title={client.name}
      subtitle={client.code + " · " + client.type}
      onClose={onClose}
      wide
    >
      <div className="form-body">
        <div className="profile-info">
          <p>
            {client.phone}
            <br />
            {client.email}
            <br />
            {client.instagram}
          </p>
          <p>
            {client.address || "Address not recorded"}
            <br />
            Registered {dateLabel(dayOf(client.createdAt))}
          </p>
        </div>
        <div className="detail-stats">
          <div>
            <span>Total booked, open invoices</span>
            <Money
              value={bs.filter(isOpen).reduce((a, b) => a + b.billed, 0)}
            />
          </div>
          <div>
            <span>Net payments</span>
            <Money value={bs.reduce((a, b) => a + b.collected, 0)} />
          </div>
          <div>
            <span>Outstanding</span>
            <Money value={bs.reduce((a, b) => a + b.outstanding, 0)} />
          </div>
        </div>
        {client.notes && <div className="notice">{client.notes}</div>}
        <h3>Booking history</h3>
        <DataTable
          rows={bs}
          columns={[
            {
              key: "code",
              label: "BOOKING",
              render: (b) => (
                <Link
                  onClick={onClose}
                  href={"/bookings/" + b.id}
                  className="table-link"
                >
                  {b.code}
                  <ArrowUpRight size={13} />
                </Link>
              ),
            },
            { key: "appointmentDate", label: "APPOINTMENT" },
            { key: "category", label: "CATEGORY" },
            {
              key: "status",
              label: "STATUS",
              render: (b) => <Badge value={b.status} />,
            },
            {
              key: "totalMinor",
              label: "VALUE",
              render: (b) => <Money value={b.billed} />,
            },
          ]}
        />
        <h3>Payment history</h3>
        <DataTable
          rows={data!.payments.filter((p) =>
            bs.some((b) => b.id === p.bookingId),
          )}
          columns={[
            { key: "code", label: "RECEIPT" },
            { key: "date", label: "DATE" },
            { key: "kind", label: "TYPE" },
            {
              key: "signedMinor",
              label: "NET COLLECTED",
              render: (p) => <Money value={p.signedMinor} />,
            },
            {
              key: "status",
              label: "STATUS",
              render: (p) => <Badge value={p.status} />,
            },
          ]}
        />
      </div>
      <div className="modal-actions">
        {canWrite && (
          <button className="btn primary" onClick={onEdit}>
            <Pencil size={15} />
            Edit client
          </button>
        )}
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
function Bookings({
  onAdd,
  onPay,
  canWrite,
}: {
  onAdd: () => void;
  onPay: (b: any) => void;
  canWrite: boolean;
}) {
  const { data } = useWorkspace();
  const d = data!,
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const rows = d.bookings.filter(
    (b) =>
      (status === "all" || b.status === status) &&
      [b.clientName, b.code, b.clientPhone, b.category]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="FROM FIRST ENQUIRY TO FINAL DETAIL"
        title="Bookings & appointments"
        description="A considered plan for every client, service, and payment."
      >
        {canWrite && (
          <button className="btn primary" onClick={onAdd}>
            <Plus size={17} />
            New booking
          </button>
        )}
      </PageHeading>
      <div className="filter-tabs">
        {["all", "confirmed", "in_progress", "completed", "cancelled"].map(
          (s) => (
            <button
              className={status === s ? "selected" : ""}
              key={s}
              onClick={() => setStatus(s)}
            >
              {s === "all" ? "All bookings" : s.replaceAll("_", " ")}
              <span>
                {d.bookings.filter((b) => s === "all" || b.status === s).length}
              </span>
            </button>
          ),
        )}
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search bookings or clients…"
          />
          <select
            aria-label="All booking statuses"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <DataTable
          rows={rows}
          columns={[
            {
              key: "code",
              label: "BOOKING / CLIENT",
              render: (b) => (
                <Link className="table-link" href={"/bookings/" + b.id}>
                  <strong>{b.clientName}</strong>
                  <small>{b.code}</small>
                </Link>
              ),
            },
            {
              key: "appointmentDate",
              label: "APPOINTMENT",
              render: (b) => (
                <div>
                  {dateLabel(b.appointmentDate)}
                  <small>
                    {b.appointmentTime} · {b.category}
                  </small>
                </div>
              ),
            },
            {
              key: "totalMinor",
              label: "INVOICE",
              render: (b) => <Money value={b.billed} />,
            },
            {
              key: "collected",
              label: "NET PAID",
              render: (b) => <Money value={b.collected} />,
            },
            {
              key: "outstanding",
              label: "REMAINING",
              render: (b) => <Money value={b.outstanding} />,
            },
            {
              key: "status",
              label: "STATUS",
              render: (b) => <Badge value={b.status} />,
            },
            {
              key: "actions",
              label: "",
              render: (b) => (
                <div className="row-actions">
                  {canWrite && b.outstanding > 0 && (
                    <button className="text-btn" onClick={() => onPay(b)}>
                      Add payment
                    </button>
                  )}
                  <Link
                    className="icon-btn"
                    aria-label={"Open " + b.code}
                    href={"/bookings/" + b.id}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </div>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
function Services({
  onAdd,
  onEdit,
  canWrite,
}: {
  onAdd: () => void;
  onEdit: (r: any) => void;
  canWrite: boolean;
}) {
  const { data } = useWorkspace();
  const [search, setSearch] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="YOUR CRAFT, CLEARLY PRICED"
        title="The service collection"
        description="Maintain your catalogue. Preserve the history of every booking."
      >
        {canWrite && (
          <button className="btn primary" onClick={onAdd}>
            <Plus size={17} />
            Add service
          </button>
        )}
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search services or categories…"
          />
          <span className="muted small">
            {data!.services.filter((s) => s.active).length} active services
          </span>
        </div>
        <DataTable
          rows={data!.services.filter((s) =>
            (s.name + " " + s.category)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          columns={[
            {
              key: "name",
              label: "SERVICE",
              render: (s) => (
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.code}</small>
                </div>
              ),
            },
            { key: "category", label: "CATEGORY" },
            {
              key: "priceMinor",
              label: "STANDARD PRICE",
              render: (s) => <Money value={s.priceMinor} />,
            },
            {
              key: "durationMinutes",
              label: "DURATION",
              render: (s) => s.durationMinutes + " min",
            },
            {
              key: "estimatedCostMinor",
              label: "EST. MATERIAL COST",
              render: (s) => <Money value={s.estimatedCostMinor} />,
            },
            {
              key: "active",
              label: "STATUS",
              render: (s) => <Badge value={s.active ? "active" : "inactive"} />,
            },
            {
              key: "actions",
              label: "",
              render: (s) =>
                canWrite ? (
                  <button className="text-btn" onClick={() => onEdit(s)}>
                    <Pencil size={14} />
                    Edit
                  </button>
                ) : null,
            },
          ]}
        />
      </section>
      <div className="notice">
        <Info size={17} />
        Estimated material costs are planning figures. Only recorded, actual
        costs affect profit. Changing the catalogue does not rewrite existing
        invoices.
      </div>
    </>
  );
}
function Payments({
  onAdd,
  columns,
  canWrite,
}: {
  onAdd: () => void;
  columns: any[];
  canWrite: boolean;
}) {
  const { data } = useWorkspace();
  const d = data!,
    range = useRange();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const r = summary(d, range.from, range.to);
  const rows = d.payments.filter(
    (p) =>
      p.date >= range.from &&
      p.date <= range.to &&
      (status === "all" || p.status === status) &&
      [
        p.code,
        p.reference,
        d.bookings.find((b) => b.id === p.bookingId)?.clientName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="EVERY RUPEE, ACCOUNTED FOR"
        title="Payments & collections"
        description="Verified receipts, client refunds, and traceable corrections."
      >
        {canWrite && (
          <button className="btn primary" onClick={onAdd}>
            <Plus size={17} />
            Record payment
          </button>
        )}
      </PageHeading>
      <div className="overview-toolbar">
        <span className="section-kicker">PAYMENT REGISTER</span>
        <DateFilter range={range} />
      </div>
      <div className="stats-grid three">
        <Stat
          label="Net money collected"
          value={r.collected}
          note="Selected period, after returns"
          Icon={WalletCards}
        />
        <Stat
          label="Cash collected"
          value={r.cashCollected}
          note="Net client cash receipts"
        />
        <Stat
          label="Digital collections"
          value={r.digitalCollected}
          note="Net digital client receipts"
          Icon={ReceiptText}
        />
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search receipt, client or reference…"
          />
          <select
            aria-label="Verification status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="posted">Verified / posted</option>
            <option value="unverified">Unverified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <DataTable rows={rows} columns={columns} />
      </section>
    </>
  );
}
function Expenses({
  onAdd,
  onAction,
  canWrite,
}: {
  onAdd: () => void;
  onAction: (s: ActionSpec) => void;
  canWrite: boolean;
}) {
  const { data } = useWorkspace();
  const d = data!,
    range = useRange();
  const r = summary(d, range.from, range.to);
  const [search, setSearch] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="SPEND WITH UNDERSTANDING"
        title="Expenses & payables"
        description="Distinguish daily running costs from investments in your salon."
      >
        {canWrite && (
          <button className="btn primary" onClick={onAdd}>
            <Plus size={17} />
            Record expense
          </button>
        )}
      </PageHeading>
      <div className="overview-toolbar">
        <span className="section-kicker">EXPENSE REGISTER</span>
        <DateFilter range={range} />
      </div>
      <div className="stats-grid three">
        <Stat
          label="Operating expenses"
          value={r.expenses}
          note="Recorded direct costs + overheads"
          Icon={ReceiptText}
        />
        <Stat
          label="Equipment purchases"
          value={r.capitalPurchases}
          note="Capital assets, excluded from expenses"
        />
        <Stat
          label="Supplier liabilities"
          value={r.unpaidExpenses}
          note={"As of " + dateLabel(range.to)}
          Icon={WalletCards}
        />
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search payee, category or description…"
          />
        </div>
        <DataTable
          rows={d.expenses.filter(
            (e) =>
              e.date >= range.from &&
              e.date <= range.to &&
              [e.payee, e.category, e.description, e.code]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase()),
          )}
          columns={[
            {
              key: "code",
              label: "EXPENSE",
              render: (e) => (
                <div>
                  <strong>{e.code}</strong>
                  <small>{e.date}</small>
                </div>
              ),
            },
            {
              key: "payee",
              label: "PAID TO",
              render: (e) => (
                <div>
                  {e.payee}
                  <small>{e.description}</small>
                </div>
              ),
            },
            {
              key: "category",
              label: "CATEGORY",
              render: (e) => (
                <div>
                  {e.category}
                  <small>
                    {e.classification}
                    {e.bookingId
                      ? " · " +
                        d.bookings.find((b) => b.id === e.bookingId)?.code
                      : ""}
                  </small>
                </div>
              ),
            },
            {
              key: "amountMinor",
              label: "AMOUNT",
              render: (e) => <Money value={e.amountMinor} />,
            },
            {
              key: "paid",
              label: "STATUS",
              render: (e) => (
                <Badge
                  value={e.voided ? "reversed" : e.paid ? "paid" : "unpaid"}
                />
              ),
            },
            {
              key: "attachments",
              label: "EVIDENCE",
              render: (e) => <Evidence entity="expense" entityId={e.id} />,
            },
            {
              key: "actions",
              label: "",
              render: (e) =>
                canWrite && !e.voided ? (
                  <div className="row-actions">
                    {!e.paid && (
                      <button
                        className="text-btn"
                        onClick={() =>
                          onAction({
                            title: "Settle this expense",
                            description:
                              "Record the full payment and clear the supplier liability.",
                            endpoint: "expenses/settle",
                            input: { id: e.id },
                            fields: ["date", "method"],
                          })
                        }
                      >
                        Mark paid
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      aria-label={"Reverse " + e.code}
                      onClick={() =>
                        onAction({
                          title: "Reverse an expense",
                          description:
                            "The original expense stays in the register and audit history.",
                          endpoint: "expenses/reverse",
                          input: { id: e.id },
                          fields: ["date", "reason"],
                          warning:
                            "For an erroneous entry or a full supplier refund only. A paid reversal restores the recorded cash/bank balance.",
                        })
                      }
                    >
                      <Undo2 size={15} />
                    </button>
                  </div>
                ) : null,
            },
          ]}
        />
      </section>
    </>
  );
}
function Evidence({ entity, entityId }: { entity: string; entityId: string }) {
  const { data, actor, refresh, notify } = useWorkspace();
  const files = data!.attachments.filter(
    (a) => a.entity === entity && a.entityId === entityId,
  );
  return (
    <div className="evidence">
      {files.map((f) => (
        <a
          key={f.id}
          href={"/api/attachments/" + f.id}
          title={f.name}
          className="text-btn"
        >
          <Paperclip size={13} />
          {f.name.slice(0, 22)}
        </a>
      ))}
      {actor.role === "finance_manager" && (
        <label className="upload-link">
          <Plus size={12} />
          {files.length ? "Add" : "Attach"}
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set("entity", entity);
              form.set("entityId", entityId);
              form.set("file", file);
              try {
                const r = await fetch("/api/attachments", {
                  method: "POST",
                  body: form,
                });
                const result = await r.json();
                if (!r.ok) throw new Error(result.error);
                await refresh();
                notify("Evidence attached.");
              } catch (err) {
                notify((err as Error).message, true);
              }
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
function BookingDetail({
  id,
  onEdit,
  onPay,
  onAction,
  canWrite,
  paymentColumns,
}: {
  id: string;
  onEdit: (b: any) => void;
  onPay: (b: any) => void;
  onAction: (s: ActionSpec) => void;
  canWrite: boolean;
  paymentColumns: any[];
}) {
  const { data } = useWorkspace();
  const d = data!,
    b = d.bookings.find((b) => b.id === id);
  if (!b)
    return (
      <Empty
        title="Booking not found."
        description="Return to the booking register and choose an available record."
        action={
          <Link href="/bookings" className="btn">
            Back to bookings
          </Link>
        }
      />
    );
  const history = d.audit.filter(
    (a) =>
      a.entityId === b.id || b.payments.some((p: any) => p.id === a.entityId),
  );
  const earned = b.status === "completed";
  return (
    <>
      <Link href="/bookings" className="back-link">
        <ArrowLeft size={15} />
        All bookings
      </Link>
      <PageHeading
        eyebrow={b.code}
        title={b.clientName}
        description={
          b.category +
          " appointment · " +
          dateLabel(b.appointmentDate) +
          " at " +
          b.appointmentTime
        }
      >
        <button className="btn" onClick={() => window.print()}>
          <Printer size={16} />
          Print
        </button>
        {canWrite && isOpen(b) && !earned && (
          <button className="btn" onClick={() => onEdit(b)}>
            <Pencil size={15} />
            Edit booking
          </button>
        )}
        {canWrite && b.outstanding > 0 && (
          <button className="btn primary" onClick={() => onPay(b)}>
            <Plus size={16} />
            Add payment
          </button>
        )}
      </PageHeading>
      <div className="booking-status-bar">
        <Badge value={b.status} />
        <span>
          {b.artist ? "Makeup: " + b.artist : "No makeup artist assigned"}
          {b.hairstylist ? " · Hair: " + b.hairstylist : ""}
        </span>
        {canWrite &&
          !["completed", "cancelled", "no_show"].includes(b.status) && (
            <div className="row-actions">
              {b.status === "inquiry" ? (
                <button
                  className="btn small-btn"
                  onClick={() =>
                    onAction({
                      title: "Confirm this booking",
                      description: "Confirm the client’s appointment.",
                      endpoint: "bookings/status",
                      input: {
                        id: b.id,
                        version: b.version,
                        status: "confirmed",
                        date: today(),
                      },
                    })
                  }
                >
                  Confirm booking
                </button>
              ) : (
                <>
                  <button
                    className="btn small-btn"
                    onClick={() =>
                      onAction({
                        title: "Complete this booking",
                        description:
                          "This recognizes earned revenue and applies any verified advances.",
                        endpoint: "bookings/status",
                        input: {
                          id: b.id,
                          version: b.version,
                          status: "completed",
                        },
                        fields: ["date"],
                        warning:
                          "Check the service lines and discount. Completed invoices are locked; later financial changes use refunds or reversals.",
                      })
                    }
                  >
                    <Check size={14} />
                    Mark completed
                  </button>
                  {b.status === "confirmed" && (
                    <button
                      className="text-btn"
                      onClick={() =>
                        onAction({
                          title: "Start appointment",
                          description: "Mark services as in progress.",
                          endpoint: "bookings/status",
                          input: {
                            id: b.id,
                            version: b.version,
                            status: "in_progress",
                            date: today(),
                          },
                        })
                      }
                    >
                      Start
                    </button>
                  )}
                </>
              )}
              <button
                className="text-btn danger-text"
                onClick={() =>
                  onAction({
                    title: "Cancel this booking",
                    description:
                      "Retained advances remain a liability until refunded.",
                    endpoint: "bookings/status",
                    input: {
                      id: b.id,
                      version: b.version,
                      status: "cancelled",
                      date: today(),
                    },
                    fields: ["reason"],
                  })
                }
              >
                Cancel
              </button>
              {b.status !== "in_progress" && (
                <button
                  className="text-btn"
                  onClick={() =>
                    onAction({
                      title: "Record a no-show",
                      description:
                        "No revenue is recognized. Any advance remains refundable.",
                      endpoint: "bookings/status",
                      input: {
                        id: b.id,
                        version: b.version,
                        status: "no_show",
                        date: today(),
                      },
                      fields: ["reason"],
                    })
                  }
                >
                  No-show
                </button>
              )}
            </div>
          )}
      </div>
      <div className="stats-grid">
        <Stat
          label="Net invoice"
          value={b.billed}
          note={
            b.credits
              ? "After " + formatMoney(b.credits) + " credit notes"
              : "After booking discount"
          }
        />
        <Stat
          label="Net payments"
          value={b.collected}
          note="Verified receipts less returns"
          Icon={WalletCards}
        />
        <Stat
          label="Remaining balance"
          value={b.outstanding}
          note={isOpen(b) ? "Amount yet to collect" : "Closed booking"}
          Icon={ReceiptText}
        />
        <Stat
          label={earned ? "Recorded contribution" : "Advance held"}
          value={earned ? b.billed - b.directCostMinor : b.advance}
          note={
            earned
              ? "Revenue less recorded direct costs"
              : "Not yet earned revenue"
          }
          tone="stat-featured"
        />
      </div>
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Service details</h2>
              <p>Prices preserved from the booking.</p>
            </div>
          </div>
          <DataTable
            rows={b.items}
            columns={[
              {
                key: "name",
                label: "SERVICE",
                render: (i) => (
                  <div>
                    {i.name}
                    <small>{i.category}</small>
                  </div>
                ),
              },
              { key: "quantity", label: "QTY" },
              {
                key: "unitPriceMinor",
                label: "PRICE",
                render: (i) => <Money value={i.unitPriceMinor} />,
              },
              {
                key: "lineTotalMinor",
                label: "TOTAL",
                render: (i) => <Money value={i.lineTotalMinor} />,
              },
            ]}
          />
          <div className="invoice-totals">
            <div>
              <span>Subtotal</span>
              <Money value={b.subtotalMinor} />
            </div>
            <div>
              <span>Discount</span>
              <Money value={-b.discountMinor} />
            </div>
            {b.credits > 0 && (
              <div>
                <span>Credit notes</span>
                <Money value={-b.credits} />
              </div>
            )}
            <div>
              <strong>Net invoice</strong>
              <strong>
                <Money value={b.billed} />
              </strong>
            </div>
          </div>
        </section>
        <section className="panel booking-notes">
          <div className="panel-head">
            <div>
              <h2>The details</h2>
              <p>People, dates and context.</p>
            </div>
          </div>
          <dl>
            <dt>Client phone</dt>
            <dd>{b.clientPhone}</dd>
            <dt>Created</dt>
            <dd>{dateLabel(dayOf(b.createdAt))}</dd>
            <dt>Completion date</dt>
            <dd>
              {b.completedDate ? dateLabel(b.completedDate) : "Not completed"}
            </dd>
            <dt>Recorded direct costs</dt>
            <dd>
              <Money value={b.directCostMinor} />
            </dd>
            <dt>Estimated materials</dt>
            <dd>
              <Money
                value={b.items.reduce(
                  (a: number, i: any) => a + i.estimatedCostMinor,
                  0,
                )}
              />{" "}
              <small>Planning only</small>
            </dd>
            <dt>Notes</dt>
            <dd>{b.notes || "No notes yet."}</dd>
            {b.cancelReason && (
              <>
                <dt>Closure reason</dt>
                <dd>{b.cancelReason}</dd>
              </>
            )}
          </dl>
          {!isOpen(b) && b.advance > 0 && (
            <div className="notice warning">
              Refundable advance: <Money value={b.advance} />. Record a refund
              against the original receipt.
            </div>
          )}
        </section>
      </div>
      <section className="panel spaced">
        <div className="panel-head">
          <div>
            <h2>Payment history</h2>
            <p>Receipts, refunds and corrections, in one place.</p>
          </div>
        </div>
        <DataTable
          rows={b.payments}
          columns={paymentColumns.filter((c) => c.key !== "bookingId")}
        />
        <div className="payment-evidence">
          {b.payments.map((p: any) => (
            <div key={p.id}>
              <span className="muted small">{p.code}</span>
              <Evidence entity="payment" entityId={p.id} />
            </div>
          ))}
        </div>
      </section>
      <section className="panel spaced">
        <div className="panel-head">
          <div>
            <h2>Booking history</h2>
            <p>Recent changes and the people behind them.</p>
          </div>
          <Link href="/audit" className="text-btn">
            All audit records
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="history-list">
          {history.map((a) => (
            <div key={a.id}>
              <div className="history-dot" />
              <div>
                <strong>{a.action.replaceAll("_", " ")}</strong>
                <p>
                  {d.users.find((u) => u.id === a.actorId)?.name} ·{" "}
                  {new Date(a.createdAt).toLocaleString("en-GB", {
                    timeZone: "Asia/Karachi",
                  })}
                </p>
                {a.reason && <span>{a.reason}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Reports() {
  const { data } = useWorkspace();
  const d = data!,
    range = useRange();
  const [kind, setKind] = useState<ReportKind>("profit"),
    [search, setSearch] = useState("");
  const rows = reportRows(d, kind, range.from, range.to).filter((r) =>
    Object.values(r).join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const columns = Object.keys(rows[0] ?? {}).map((key) => ({
    key,
    label: key.toUpperCase(),
    render: (r: any) =>
      typeof r[key] === "number"
        ? new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(
            r[key],
          )
        : String(r[key] ?? "—"),
  }));
  const url = `/api/exports?kind=${kind}&from=${range.from}&to=${range.to}&q=${encodeURIComponent(search)}`;
  return (
    <>
      <PageHeading
        eyebrow="KNOW YOUR NUMBERS"
        title="Reports & financial clarity"
        description="Business performance from verified transactions, ready to share."
      >
        <button className="btn" onClick={() => window.print()}>
          <Printer size={16} />
          Print / save PDF
        </button>
        <a className="btn primary" href={url + "&format=xlsx"}>
          <ArrowDownToLine size={16} />
          Excel export
        </a>
      </PageHeading>
      <div className="overview-toolbar">
        <select
          className="report-selector"
          aria-label="Report type"
          value={kind}
          onChange={(e) => setKind(e.target.value as ReportKind)}
        >
          {Object.entries(REPORTS).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
        <DateFilter range={range} />
      </div>
      {["receivables", "clients"].includes(kind) && (
        <div className="notice">
          This report shows the current register across all dates. Other reports
          use your selected range.
        </div>
      )}
      {kind === "bookings" && (
        <div className="notice">
          Completed bookings in the selected range. Invoice credits and direct
          costs reflect all currently recorded entries for those bookings.
        </div>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{REPORTS[kind]}</h2>
            <p>
              {dateLabel(range.from)} to {dateLabel(range.to)} · PKR ·
              Asia/Karachi
            </p>
          </div>
          <a className="btn small-btn" href={url + "&format=csv"}>
            <ArrowDownToLine size={14} />
            CSV
          </a>
        </div>
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search this report…"
          />
        </div>
        <DataTable rows={rows} columns={columns} pageSize={20} />
      </section>
      <div className="report-notes">
        <ShieldCheck size={18} />
        <p>
          Operating profit is calculated from earned revenue less recorded
          direct costs and overheads. Advances and equipment purchases are
          excluded. Depreciation, tax, inventory accounting, and payroll accrual
          automation are scheduled for later releases.
        </p>
      </div>
    </>
  );
}
function Audit() {
  const { data } = useWorkspace();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<any>(null);
  return (
    <>
      <PageHeading
        eyebrow="A HISTORY YOU CAN TRUST"
        title="Audit history"
        description="An append-only record of who changed what, and why."
      />
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search action, record or reason…"
          />
          <span className="muted small">Latest 200 events</span>
        </div>
        <DataTable
          rows={data!.audit.filter((a) =>
            [a.action, a.entity, a.entityId, a.reason]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          columns={[
            {
              key: "createdAt",
              label: "TIME (KARACHI)",
              render: (a) =>
                new Date(a.createdAt).toLocaleString("en-GB", {
                  timeZone: "Asia/Karachi",
                }),
            },
            {
              key: "actorId",
              label: "PERSON",
              render: (a) => data!.users.find((u) => u.id === a.actorId)?.name,
            },
            {
              key: "action",
              label: "ACTION",
              render: (a) => <Badge value={a.action} />,
            },
            {
              key: "entity",
              label: "RECORD",
              render: (a) => (
                <div>
                  {a.entity}
                  <small>{a.entityId.slice(0, 8)}</small>
                </div>
              ),
            },
            { key: "reason", label: "REASON" },
            {
              key: "actions",
              label: "",
              render: (a) => (
                <button className="text-btn" onClick={() => setSelected(a)}>
                  Inspect
                  <ArrowUpRight size={13} />
                </button>
              ),
            },
          ]}
        />
      </section>
      {selected && (
        <Modal
          title="Audit event details"
          subtitle={selected.action.replaceAll("_", " ")}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="form-body">
            <p className="small muted">
              {selected.reason ||
                "No correction reason was required for this action."}
            </p>
            <div className="audit-json">
              <div>
                <h3>Previous value</h3>
                <pre>{JSON.stringify(selected.before, null, 2)}</pre>
              </div>
              <div>
                <h3>New value</h3>
                <pre>{JSON.stringify(selected.after, null, 2)}</pre>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Settings() {
  const { data, actor } = useWorkspace();
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Simple by design"
        description="One finance manager. One reliable source of business records."
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Business settings</h2>
              <p>Configured for your first release.</p>
            </div>
          </div>
          <dl className="settings-list">
            <dt>Business</dt>
            <dd>{data!.config.name}</dd>
            <dt>Currency</dt>
            <dd>Pakistani Rupees (PKR)</dd>
            <dt>Business timezone</dt>
            <dd>Asia/Karachi, UTC+05:00</dd>
            <dt>Dataset</dt>
            <dd>
              <Badge value={data!.config.demo ? "demo" : "live"} />
            </dd>
            <dt>Your access</dt>
            <dd>
              {actor.role === "owner"
                ? "Owner, read-only"
                : "Finance Manager, administrator"}
            </dd>
            <dt>Session</dt>
            <dd>12 hours, revocable, HTTP-only cookie</dd>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>The first working release</h2>
              <p>Built around your daily operations.</p>
            </div>
          </div>
          <div className="release-list">
            {[
              "Credentials login and two roles",
              "Clients and service catalogue",
              "Multi-service bookings and discounts",
              "Verified receipts and customer advances",
              "Refunds and documented corrections",
              "Operating costs, capital and payables",
              "Ledger, reporting, CSV and Excel",
              "Private receipt and evidence attachments",
            ].map((t) => (
              <div key={t}>
                <Check size={16} />
                {t}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Next in SalonOS</h2>
              <p>Planned modules, outside this release.</p>
            </div>
          </div>
          <div className="release-list muted">
            {[
              "Inventory, units and material consumption",
              "Creative shoots and project participants",
              "Wardrobe and jewellery checkouts",
              "Staff, commissions and payroll",
              "Daily closing and staff reporting inbox",
            ].map((t) => (
              <div key={t}>
                <Clock3 size={16} />
                {t}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Before entering real records</h2>
              <p>A clean start matters.</p>
            </div>
          </div>
          <div className="form-body">
            <p className="muted">
              Use a separate, empty PostgreSQL database with demo mode disabled.
              Run migrations and create your two user accounts. Demo data is
              never imported automatically.
            </p>
            <p className="muted">
              Back up the database, test a restore, enable HTTPS, and use unique
              passwords. See the included deployment and operations guide for
              exact steps.
            </p>
            <div className="notice">
              Your account passwords and demo reset are managed through the
              included administrator commands. There is no destructive reset
              button in this workspace.
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
