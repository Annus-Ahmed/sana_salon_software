import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/lib/domain";
export function originGuard(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw new DomainError("APP_ORIGIN is not configured.", 503);
  const allowed = new URL(configured).origin;
  const incoming = request.headers.get("origin");
  if (incoming !== allowed)
    throw new DomainError("This request origin is not allowed.", 403);
}
export function failure(error: unknown) {
  if (error instanceof DomainError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".") || "Form"}: ${i.message}`)
          .slice(0, 3)
          .join(" "),
      },
      { status: 400 },
    );
  const incident = crypto.randomUUID();
  console.error(
    JSON.stringify({
      incident,
      error: error instanceof Error ? error.name : "UnknownError",
      code: (error as any)?.code ?? (error as any)?.cause?.code,
      frames:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => line.trim().startsWith("at "))
              .slice(0, 5)
          : undefined,
    }),
  );
  return NextResponse.json(
    {
      error:
        "Something went wrong. No incomplete financial transaction was saved.",
      incident,
    },
    { status: 500 },
  );
}
export async function readJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    throw new DomainError("Form is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("Request body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw new DomainError("Form is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("Invalid JSON request.");
  }
}
