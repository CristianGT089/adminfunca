import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { createSession, requireUser } from "@/lib/core/auth";
import { comparePassword, hashPassword, validatePassword } from "@/lib/core/passwords";
import { audit } from "@/lib/core/audit";
import { readBody, unauthenticated } from "@/lib/core/http";

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();
  const { data, error } = await readBody(req, schema);
  if (error) return error;

  if (!(await comparePassword(data.current, user.passwordHash))) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  }
  const invalid = validatePassword(data.next);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (data.current === data.next) return NextResponse.json({ error: "La nueva contraseña debe ser distinta" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(data.next), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  // Changing the password invalidates the other sessions; only the current one is renewed.
  await createSession(updated);
  await audit("auth.changePassword", { userId: user.id });
  return NextResponse.json({ ok: true });
}
