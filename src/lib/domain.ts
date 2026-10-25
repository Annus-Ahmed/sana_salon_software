export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: "finance_manager" | "owner";
};
export const METHODS = [
  "Cash",
  "Bank transfer",
  "Raast",
  "Easypaisa",
  "JazzCash",
  "Card",
  "Other",
] as const;
export const CATEGORIES = [
  "Bridal Makeup",
  "Party Makeup",
  "Hair Styling",
  "Hair Treatment",
  "Facial",
  "Skin Treatment",
  "Dressing",
  "Wardrobe Styling",
  "Jewellery Styling",
  "Model Makeup",
  "Other Services",
] as const;
export const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Water",
  "Internet",
  "Salaries",
  "Staff commissions",
  "Marketing",
  "Models",
  "Photographers",
  "Designers",
  "Embroidery",
  "Jewellery rental",
  "Outfit rental",
  "Equipment",
  "Repairs",
  "Transport",
  "Cleaning",
  "Miscellaneous",
] as const;
export const STATUSES = [
  "inquiry",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;
export const methodAccount: Record<string, string> = {
  Cash: "CASH",
  "Bank transfer": "BANK",
  Raast: "RAAST",
  Easypaisa: "EASYPAISA",
  JazzCash: "JAZZCASH",
  Card: "CARD",
  Other: "OTHER_CASH",
};
export function requireManager(actor: Actor) {
  if (actor.role !== "finance_manager")
    throw new DomainError("Owner access is read-only.", 403);
}
export function money(input: string | number): number {
  const value = String(input).trim();
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value))
    throw new DomainError(
      "Enter a valid PKR amount with no more than two decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function formatMoney(minor: number, compact = false): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: minor % 100 ? 2 : 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(minor / 100);
}
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function dayOf(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function addDays(value: string, days: number) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function validDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function financialDate(value: string) {
  if (!validDay(value))
    throw new DomainError("Choose a valid transaction date.");
  if (value > today())
    throw new DomainError(
      "A financial transaction cannot be dated in the future.",
    );
}
export function normalizePhone(value: string): string {
  let v = value.replace(/[\s()+.-]/g, "");
  if (v.startsWith("00")) v = v.slice(2);
  if (v.startsWith("0")) v = "92" + v.slice(1);
  if (!/^\d{10,15}$/.test(v))
    throw new DomainError(
      "Enter a valid phone number, including country code.",
    );
  return "+" + v;
}
export function bookingBalance(
  b: { totalMinor: number; status: string },
  ps: { status: string; signedMinor: number; creditMinor: number }[],
) {
  const posted = ps.filter((p) => p.status === "posted");
  const collected = posted.reduce((a, p) => a + p.signedMinor, 0);
  const credits = posted.reduce((a, p) => a + p.creditMinor, 0);
  const billed = b.totalMinor - credits;
  return {
    collected,
    credits,
    billed,
    outstanding: ["cancelled", "no_show"].includes(b.status)
      ? 0
      : Math.max(0, billed - collected),
    advance: b.status !== "completed" ? collected : 0,
  };
}
export function assertBalanced(
  lines: { accountCode: string; amountMinor: number }[],
) {
  if (
    lines.length < 2 ||
    lines.some(
      (l) => !Number.isSafeInteger(l.amountMinor) || l.amountMinor === 0,
    ) ||
    lines.reduce((sum, l) => sum + l.amountMinor, 0) !== 0
  )
    throw new DomainError(
      "Unbalanced financial entry. No records were saved.",
      500,
    );
}
export function code(prefix: string, id: string) {
  return prefix + "-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
}
export const chartAccounts = [
  ["CASH", "Cash", "asset"],
  ["BANK", "Bank transfers", "asset"],
  ["RAAST", "Raast", "asset"],
  ["EASYPAISA", "Easypaisa", "asset"],
  ["JAZZCASH", "JazzCash", "asset"],
  ["CARD", "Card clearing", "asset"],
  ["OTHER_CASH", "Other collections", "asset"],
  ["RECEIVABLES", "Customer receivables", "asset"],
  ["ADVANCES", "Customer advances", "liability"],
  ["PAYABLES", "Supplier payables", "liability"],
  ["REVENUE", "Service revenue", "income"],
  ["SALES_RETURNS", "Service refunds / credit notes", "contra_income"],
  ["DIRECT_COST", "Direct booking costs", "expense"],
  ["OVERHEAD", "Operating expenses", "expense"],
  ["EQUIPMENT", "Equipment at cost", "asset"],
] as const;

/** Integer allocation with an exact total, including one-paisa discounts. */
export function allocateMinor(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  // BigInt multiplication prevents precision loss while calculating shares.
  const shares = weights.map((w) => ({
    amount: Number((BigInt(total) * BigInt(w)) / BigInt(sum)),
    remainder: (BigInt(total) * BigInt(w)) % BigInt(sum),
  }));
  let left = total - shares.reduce((a, s) => a + s.amount, 0);
  const order = shares
    .map((s, i) => ({ i, remainder: s.remainder }))
    .sort((a, b) =>
      a.remainder > b.remainder
        ? -1
        : a.remainder < b.remainder
          ? 1
          : a.i - b.i,
    );
  for (const { i } of order) {
    if (left-- <= 0) break;
    shares[i].amount++;
  }
  return shares.map((s) => s.amount);
}
