"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UsersRound,
  CalendarDays,
  Sparkles,
  WalletCards,
  ReceiptText,
  ChartNoAxesCombined,
  History,
  Settings2,
  LogOut,
  Menu,
  PanelLeftClose,
  Search,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  X,
} from "lucide-react";
import type { Actor } from "@/lib/domain";
import type { Snapshot } from "@/server/queries";
type Workspace = {
  actor: Actor;
  data: Snapshot | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  mutate: (path: string, input: unknown, key?: string) => Promise<any>;
};
const Context = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
const links = [
  ["dashboard", "Overview", LayoutDashboard],
  ["clients", "Clients", UsersRound],
  ["bookings", "Bookings", CalendarDays],
  ["services", "Services", Sparkles],
  ["payments", "Payments", WalletCards],
  ["expenses", "Expenses", ReceiptText],
  ["reports", "Reports", ChartNoAxesCombined],
  ["audit", "Audit history", History],
  ["settings", "Settings", Settings2],
] as const;
export function WorkspaceProvider({
  actor,
  children,
}: {
  actor: Actor;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState<{ message: string; error?: boolean } | null>(
      null,
    ),
    [menu, setMenu] = useState(false);
  const path = usePathname();
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/bootstrap", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setData(result);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    setMenu(false);
  }, [path]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const mutate = useCallback(
    async (endpoint: string, input: unknown, key = crypto.randomUUID()) => {
      const r = await fetch("/api/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(input),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await refresh();
      return result;
    },
    [refresh],
  );
  return (
    <Context.Provider
      value={{ actor, data, loading, error, refresh, notify, mutate }}
    >
      <div className="workspace">
        <button
          aria-label="Close navigation"
          className={`sidebar-overlay ${menu ? "show" : ""}`}
          onClick={() => setMenu(false)}
        />
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <Link href="/dashboard" className="wordmark">
            <span className="brand-icon">S</span>Salon<span>OS</span>
          </Link>
          <div className="workspace-label">FINANCE MANAGER EDITION</div>
          <div className="studio-card">
            <div className="studio-avatar">S</div>
            <div>
              <strong>{data?.config.name ?? "Your salon"}</strong>
              <span>
                <i />
                Main workspace
              </span>
            </div>
            <PanelLeftClose size={16} />
          </div>
          <p className="nav-label">WORKSPACE</p>
          <nav aria-label="Main navigation">
            {links.map(([slug, label, Icon]) => (
              <Link
                key={slug}
                href={"/" + slug}
                className={path.startsWith("/" + slug) ? "active" : ""}
              >
                <Icon size={19} />
                <span>{label}</span>
                {slug === "bookings" && data && (
                  <small>
                    {
                      data.bookings.filter((b) =>
                        ["confirmed", "in_progress"].includes(b.status),
                      ).length
                    }
                  </small>
                )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="quiet-card">
              <ShieldCheck size={20} />
              <strong>A clear view of your business.</strong>
              <p>
                {actor.role === "owner"
                  ? "Your access is read-only. Explore and export with confidence."
                  : "Verified entries. Traceable changes. Financial clarity."}
              </p>
            </div>
            <div className="user-card">
              <div className="user-avatar">
                {actor.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <strong>{actor.name}</strong>
                <span>
                  {actor.role === "owner"
                    ? "Owner · View only"
                    : "Finance Manager"}
                </span>
              </div>
              <button
                title="Log out"
                aria-label="Log out"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
              >
                <LogOut size={17} />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace-main">
          <header className="topbar">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {path.startsWith("/bookings/")
                  ? "Booking details"
                  : (links.find(([slug]) => path.startsWith("/" + slug))?.[1] ??
                    "Overview")}
              </strong>
            </div>
            <div className="topbar-right">
              <span className="timezone">
                Asia/Karachi <span>•</span> PKR
              </span>
              {data?.config.demo && (
                <span className="demo-badge">DEMO DATA</span>
              )}
              <button
                className="icon-btn"
                title="Refresh records"
                aria-label="Refresh records"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
              <div className="mini-avatar">{actor.name[0]}</div>
            </div>
          </header>
          <main className="main-content">
            {data?.config.demo && (
              <div className="demo-strip">
                <span className="status-dot" />
                Demonstration workspace. All people and transactions are
                fictional.
                <Link href="/settings">
                  Workspace details
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            )}
            {error && (
              <div className="notice error" role="alert">
                {error}
                <button className="text-btn" onClick={refresh}>
                  Retry
                </button>
              </div>
            )}
            {loading ? (
              <div className="loading-state">
                <span className="loader" />
                <p>Preparing your workspace…</p>
              </div>
            ) : data ? (
              children
            ) : (
              <div className="empty-state">
                <h2>Your workspace is unavailable.</h2>
                <p>Check your database connection and setup instructions.</p>
                <button className="btn" onClick={refresh}>
                  Retry
                </button>
              </div>
            )}
          </main>
          <footer className="workspace-footer">
            SalonOS <span>Made for the business behind the beauty.</span>
            <span>All amounts in PKR</span>
          </footer>
        </div>
        {toast && (
          <div
            className={"toast " + (toast.error ? "toast-error" : "")}
            role="status"
          >
            <ShieldCheck size={17} />
            {toast.message}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
