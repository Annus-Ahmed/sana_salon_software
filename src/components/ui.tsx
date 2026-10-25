"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Search, Inbox } from "lucide-react";
import { flushSync } from "react-dom";
import { formatMoney } from "@/lib/domain";
export function Money({
  value,
  muted = false,
}: {
  value: number;
  muted?: boolean;
}) {
  return (
    <span className={"money " + (muted ? "muted" : "")}>
      {formatMoney(value)}
    </span>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={"badge badge-" + value.replaceAll(" ", "_").toLowerCase()}>
      <i />
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "modal-wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={id}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <p className="eyebrow">SALONOS WORKSPACE</p>
          <h2 id={id}>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search records…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function SearchSelect({
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(
    options.find((o) => o.id === value)?.label ?? "",
  );
  useEffect(() => {
    setText(options.find((o) => o.id === value)?.label ?? "");
  }, [value]);
  return (
    <label>
      {label}
      <input
        list={id}
        value={text}
        required={required}
        placeholder="Type to search and select…"
        onChange={(e) => {
          setText(e.target.value);
          onChange(options.find((o) => o.label === e.target.value)?.id ?? "");
        }}
      />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
      {text && !value && (
        <span className="field-hint warning">
          Select a matching record from the suggestions.
        </span>
      )}
    </label>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DataTable({
  columns,
  rows,
  empty = "No matching records.",
  pageSize = 10,
}: {
  columns: {
    key: string;
    label: string;
    render?: (row: any) => React.ReactNode;
    className?: string;
  }[];
  rows: any[];
  empty?: string;
  pageSize?: number;
}) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true)),
      after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const [page, setPage] = useState(1),
    [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  useEffect(() => setPage(1), [rows.length]);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const x = a[sort.key],
          y = b[sort.key];
        return (
          (typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x ?? "").localeCompare(String(y ?? ""))) *
          (sort.asc ? 1 : -1)
        );
      })
    : rows;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  <button
                    onClick={() =>
                      setSort({
                        key: c.key,
                        asc: sort?.key === c.key ? !sort.asc : true,
                      })
                    }
                  >
                    {c.label}
                    {sort?.key === c.key ? (
                      <span>{sort.asc ? " ↑" : " ↓"}</span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(printing
              ? sorted
              : sorted.slice((current - 1) * pageSize, current * pageSize)
            ).map((row, index) => (
              <tr key={row.id ?? index}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            title={empty}
            description="Try another filter, or add your first record."
          />
        )}
      </div>
      {rows.length > pageSize && (
        <div className="table-pagination">
          <span>
            Showing {(current - 1) * pageSize + 1}–
            {Math.min(current * pageSize, rows.length)} of {rows.length}
          </span>
          <div>
            <button
              className="icon-btn"
              aria-label="Previous page"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {current} / {pages}
            </span>
            <button
              className="icon-btn"
              aria-label="Next page"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
