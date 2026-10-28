import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { clientIp, createSession } from "@/lib/core/auth";
import { comparePassword, hashPassword } from "@/lib/core/passwords";
import { audit } from "@/lib/core/audit";
import { readBody } from "@/lib/core/http";
import { permissionsOf } from "@/lib/core/permissions";
import { allow } from "@/lib/core/rateLimit";

const schema = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
// Per IP, against password spraying across many accounts.
const IP_ATTEMPTS = 20;
const IP_WINDOW_MS = 15 * 60_000;

// Same answer for unknown, inactive, locked or wrong password: the response must not reveal
// which usernames exist.
const invalidCredentials = () =>
  NextResponse.json({ error: "Usuario o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea 15 minutos." }, { status: 401 });

// bcrypt is also run for unknown users so the response time does not reveal them either.
let dummyHash: Promise<string> | null = null;

export async function POST(req: Request) {
  if (!allow(`login:${(await clientIp()) ?? "unknown"}`, IP_ATTEMPTS, IP_WINDOW_MS)) {
    return NextResponse.json({ error: "Demasiados intentos desde esta conexión. Intenta de nuevo en unos minutos." }, { status: 429 });
  }
  const { data, error } = await readBody(req, schema);
  if (error) return error;

  const record = await prisma.user.findUnique({ where: { username: data.username.toLowerCase() } });
  dummyHash ??= hashPassword(crypto.randomUUID());
  const valid = await comparePassword(data.password, record?.passwordHash ?? (await dummyHash));

  if (!record || !record.active) {
    await audit("auth.loginFailed", { details: { username: data.username.slice(0, 60) } });
    return invalidCredentials();
  }
  if (record.lockedUntil && record.lockedUntil > new Date()) {
    await audit("auth.loginFailed", { userId: record.id, details: { locked: true } });
    return invalidCredentials();
  }
  if (!valid) {
    // Atomic increment: parallel requests cannot get extra attempts.
    const { failedAttempts } = await prisma.user.update({ where: { id: record.id }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true } });
    const lock = failedAttempts >= MAX_ATTEMPTS;
    if (lock) {
      await prisma.user.update({ where: { id: record.id }, data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) } });
    }
    await audit("auth.loginFailed", { userId: record.id, details: { attempts: failedAttempts, locked: lock } });
    return invalidCredentials();
  }

  const updated = await prisma.user.update({
    where: { id: record.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(updated);
  await audit("auth.login", { userId: record.id });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    role: updated.role,
    mustChangePassword: updated.mustChangePassword,
    permissions: permissionsOf(updated.role),
  });
}
