import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { requireActor, login, logout, COOKIE } from "@/server/auth";
import { execute, type Operation, audit } from "@/server/operations";
import {
  snapshot,
  reportRows,
  REPORTS,
  type ReportKind,
} from "@/server/queries";
import { originGuard, failure, readJson } from "@/server/http";
import { DomainError, requireManager, today, validDay } from "@/lib/domain";
import { db } from "@/db";
import * as s from "@/db/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments: string[] }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const path = (await ctx.params).segments.join("/");
    if (path === "health") {
      await db().execute(sql`SELECT 1`);
      return NextResponse.json(
        { status: "ready" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const actor = await requireActor();
    if (path === "bootstrap")
      return NextResponse.json(await snapshot(actor), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path === "exports") {
      const kind = req.nextUrl.searchParams.get("kind") ?? "sales";
      if (!(kind in REPORTS)) throw new DomainError("Unknown report.");
      const from = req.nextUrl.searchParams.get("from") ?? today(),
        to = req.nextUrl.searchParams.get("to") ?? today();
      if (
        !validDay(from) ||
        !validDay(to) ||
        from > to ||
        Date.parse(to) - Date.parse(from) > 366 * 86400000
      )
        throw new DomainError("Choose a date range of no more than 366 days.");
      const query = (req.nextUrl.searchParams.get("q") ?? "")
        .slice(0, 200)
        .toLowerCase();
      const rows = reportRows(
        await snapshot(actor),
        kind as ReportKind,
        from,
        to,
      ).filter((row) =>
        Object.values(row).join(" ").toLowerCase().includes(query),
      );
      const name = `salonos-${kind}-${from}-${to}`;
      if (req.nextUrl.searchParams.get("format") === "xlsx") {
        const book = new ExcelJS.Workbook();
        book.creator = "SalonOS";
        const sheet = book.addWorksheet(
          REPORTS[kind as ReportKind].slice(0, 31),
        );
        const columns = Object.keys(rows[0] ?? { Message: "" });
        sheet.columns = columns.map((key) => ({
          header: key,
          key,
          width: Math.min(45, Math.max(18, key.length + 3)),
        }));
        for (const row of rows) sheet.addRow(row);
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF34352F" },
        };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        const bytes = await book.xlsx.writeBuffer();
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${name}.xlsx"`,
            "Cache-Control": "no-store",
          },
        });
      }
      const escape = (x: unknown) => {
        let value = String(x ?? "");
        if (/^[=+\-@\t\r]/.test(value) && typeof x !== "number")
          value = "'" + value;
        return '"' + value.replaceAll('"', '""') + '"';
      };
      const keys = Object.keys(rows[0] ?? { Message: "" });
      const csv =
        "\ufeff" +
        [
          keys.map(escape).join(","),
          ...rows.map((row) => keys.map((k) => escape(row[k])).join(",")),
        ].join("\r\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (path.startsWith("attachments/")) {
      const id = path.split("/")[1];
      if (!/^[\da-f-]{36}$/i.test(id))
        throw new DomainError("Invalid file reference.");
      const [file] = await db()
        .select()
        .from(s.attachments)
        .where(eq(s.attachments.id, id));
      if (!file) throw new DomainError("File not found.", 404);
      return new NextResponse(new Uint8Array(file.data), {
        headers: {
          "Content-Type": file.mime,
          "Content-Disposition": `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new DomainError("Page not found.", 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    originGuard(req);
    const path = (await ctx.params).segments.join("/");
    if (path === "auth/login") {
      const p = await readJson(req);
      if (
        typeof p.email !== "string" ||
        typeof p.password !== "string" ||
        p.email.length > 254 ||
        p.password.length > 256
      )
        throw new DomainError("Enter your email and password.");
      const result = await login(
        p.email,
        p.password,
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
      );
      (await cookies()).set(COOKIE, result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: result.expiresAt,
        path: "/",
      });
      return NextResponse.json({ actor: result.actor });
    }
    const actor = await requireActor();
    if (path === "auth/logout") {
      await logout((await cookies()).get(COOKIE)?.value);
      (await cookies()).delete(COOKIE);
      return NextResponse.json({ ok: true });
    }
    requireManager(actor);
    if (path === "attachments") {
      if (!req.headers.has("content-length"))
        throw new DomainError("Upload requires a content length.", 411);
      if (Number(req.headers.get("content-length") ?? 0) > 3300000)
        throw new DomainError("File must be under 3 MB.", 413);
      const form = await req.formData();
      const file = form.get("file"),
        entity = String(form.get("entity")),
        entityId = String(form.get("entityId"));
      if (!(file instanceof File) || file.size < 1 || file.size > 3145728)
        throw new DomainError("Upload a PNG, JPEG, or PDF up to 3 MB.");
      if (!/^[\da-f-]{36}$/i.test(entityId))
        throw new DomainError("Invalid record reference.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
      const mime = png
        ? "image/png"
        : jpeg
          ? "image/jpeg"
          : pdf
            ? "application/pdf"
            : null;
      if (!mime || mime !== file.type)
        throw new DomainError("File contents must match a PNG, JPEG, or PDF.");
      if (!["payment", "expense"].includes(entity))
        throw new DomainError("Unsupported attachment record.");
      const result = await db().transaction(async (tx) => {
        const table = entity === "payment" ? s.payments : s.expenses;
        const [parent] = await tx
          .select({ id: table.id })
          .from(table)
          .where(eq(table.id, entityId));
        if (!parent)
          throw new DomainError("Save the record before attaching evidence.");
        const [attachment] = await tx
          .insert(s.attachments)
          .values({
            entity,
            entityId,
            name: file.name.slice(0, 120).replace(/[^a-zA-Z0-9._-]/g, "_"),
            mime,
            size: file.size,
            data: bytes,
            createdBy: actor.id,
          })
          .returning({ id: s.attachments.id, name: s.attachments.name });
        await audit(
          tx,
          actor,
          "attached_evidence",
          entity,
          entityId,
          null,
          attachment,
        );
        return attachment;
      });
      return NextResponse.json(result, { status: 201 });
    }
    const map: Record<string, Operation> = {
      clients: "client.save",
      services: "service.save",
      bookings: "booking.save",
      "bookings/status": "booking.status",
      payments: "payment.receive",
      "payments/verify": "payment.verify",
      "payments/reject": "payment.reject",
      "payments/refund": "payment.refund",
      "payments/reverse": "payment.reverse",
      expenses: "expense.create",
      "expenses/settle": "expense.settle",
      "expenses/reverse": "expense.reverse",
    };
    if (!map[path]) throw new DomainError("Action not found.", 404);
    return NextResponse.json(
      await execute(
        actor,
        map[path],
        await readJson(req),
        req.headers.get("idempotency-key") ?? "",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
