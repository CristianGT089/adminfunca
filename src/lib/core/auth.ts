import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { Role, User } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPermission, type Permission } from "./permissions";

const COOKIE_NAME = "admin_funca_session";
const SESSION_HOURS = 8;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is missing or too short");
    return new TextEncoder().encode("dev-secret-change-in-production-please-use-a-long-random-string");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string; // user id
  role: Role;
  // User.sessionVersion when the session was issued (see the schema).
  sv: number;
};

export async function createSession(user: Pick<User, "id" | "role" | "sessionVersion">) {
  const payload: SessionPayload = { sub: user.id, role: user.role, sv: user.sessionVersion };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * SESSION_HOURS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Authenticated, active user, or null. */
export async function requireUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.active) return null;
  // The session was issued before the last password change / reset / role change: no longer valid.
  if (session.sv !== user.sessionVersion) return null;
  return user;
}

/** User holding the given permission (or any of the list), or null. */
export async function requirePermission(permission: Permission | Permission[]): Promise<User | null> {
  const user = await requireUser();
  if (!user || !hasPermission(user.role, permission)) return null;
  return user;
}

/**
 * Client IP for the audit log and rate limits. The app only listens on 127.0.0.1 behind the
 * VPS nginx, which sets X-Real-IP to the connection's address. The first X-Forwarded-For
 * entry is whatever the client sent (spoofable), so only its last entry, appended by nginx,
 * is used as a fallback.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null;
}
