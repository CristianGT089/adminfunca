import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import type { User } from "@prisma/client";
import { requirePermission } from "./auth";
import type { Permission } from "./permissions";

// Error messages are shown to the user, so they stay in Spanish.
export const unauthenticated = () => NextResponse.json({ error: "No autenticado" }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
export const notFound = (what = "Registro") => NextResponse.json({ error: `${what} no encontrado` }, { status: 404 });
export const validationError = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/**
 * Reads and validates the JSON request body with a Zod schema. Returns the data or a 400
 * response ready to return.
 */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  const body = await req.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.length ? `${first.path.join(".")}: ` : "";
    return { error: validationError(`${field}${first?.message ?? "Datos inválidos"}`) };
  }
  return { data: result.data };
}

/**
 * Wraps a handler requiring a permission (or any of a list). The handler receives the already
 * authenticated user. Distinguishes 401 (no session) from 403 (no permission).
 */
export function withPermission<Ctx>(permission: Permission | Permission[], handler: (req: Request, user: User, ctx: Ctx) => Promise<NextResponse>) {
  return async (req: Request, ctx: Ctx) => {
    const user = await requirePermission(permission);
    if (!user) {
      const { requireUser } = await import("./auth");
      return (await requireUser()) ? forbidden() : unauthenticated();
    }
    return handler(req, user, ctx);
  };
}

export type IdParams = { params: Promise<{ id: string }> };

/** `?limit=` from the query string as an integer in [1, max]; `fallback` when missing or invalid. */
export function queryLimit(url: URL, fallback: number, max: number): number {
  const n = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : Math.min(fallback, max);
}

/** Business-rule error with its HTTP status. Services throw it; `errorResponse` translates it. */
export class BusinessError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/** Turns a BusinessError into a JSON response; any other error is rethrown. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}
