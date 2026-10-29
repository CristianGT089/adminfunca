import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { Prisma, PrismaClient, User } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPermission, type Permission } from "./permissions";

const isProduction = process.env.NODE_ENV === "production";
// "__Host-" makes the browser reject the cookie unless it is Secure, host-only and Path=/.
const COOKIE_NAME = isProduction ? "__Host-admin_funca_session" : "admin_funca_session";
const SESSION_HOURS = 8;
// Without activity for this long the session ends (shared office computers).
const IDLE_MINUTES = 120;
// lastSeenAt is refreshed at most this often, not on every request.
const TOUCH_MINUTES = 5;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (isProduction) throw new Error("AUTH_SECRET is missing or too short");
    return new TextEncoder().encode("dev-secret-change-in-production-please-use-a-long-random-string");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string; // user id
  sid: string; // Session row id
};

type Db = PrismaClient | Prisma.TransactionClient;

/** Creates the Session row and sets the cookie with a signed reference to it. */
export async function createSession(user: Pick<User, "id">) {
  const h = await headers();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000),
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const payload: SessionPayload = { sub: user.id, sid: session.id };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * SESSION_HOURS,
  });
  return session;
}

/** Logout: revokes the current session server-side and deletes the cookie. */
export async function destroySession() {
  const session = await getSession();
  if (session) await prisma.session.updateMany({ where: { id: session.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Revokes every open session of the user (optionally except one). Returns how many. */
export async function revokeSessions(userId: string, options: { except?: string; db?: Db } = {}) {
  const r = await (options.db ?? prisma).session.updateMany({
    where: { userId, revokedAt: null, ...(options.except ? { id: { not: options.except } } : {}) },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const p = payload as Partial<SessionPayload>;
    return typeof p.sub === "string" && typeof p.sid === "string" ? { sub: p.sub, sid: p.sid } : null;
  } catch {
    return null;
  }
}

/** Authenticated, active user with a valid (not revoked, not expired, not idle) session, or null. */
export async function requireUser(): Promise<User | null> {
  const payload = await getSession();
  if (!payload) return null;
  const session = await prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
  const now = Date.now();
  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt ||
    session.expiresAt.getTime() <= now ||
    now - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000 ||
    !session.user.active
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_MINUTES * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  return session.user;
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
