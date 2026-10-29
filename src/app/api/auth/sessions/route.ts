import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/prisma";
import { getSession, requireUser, revokeSessions } from "@/lib/core/auth";
import { audit } from "@/lib/core/audit";
import { unauthenticated } from "@/lib/core/http";

/** The user's open sessions (devices), newest activity first. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthenticated();
  const current = await getSession();
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
  });
  return NextResponse.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === current?.sid })) });
}

/** `?id=<session>` closes that session of the user; without id, closes all the others. */
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();
  const current = await getSession();
  const id = new URL(req.url).searchParams.get("id");
  const closed = id
    ? (await prisma.session.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })).count
    : await revokeSessions(user.id, { except: current?.sid });
  await audit("auth.revokeSessions", { userId: user.id, details: { closed, single: !!id } });
  return NextResponse.json({ closed });
}
