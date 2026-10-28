import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/prisma";
import { withPermission, notFound, type IdParams } from "@/lib/core/http";
import { generatePassword, hashPassword } from "@/lib/core/passwords";
import { audit } from "@/lib/core/audit";

export const POST = withPermission("users.manage", async (_req, actor, { params }: IdParams) => {
  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return notFound("Usuario");
  // One's own password is changed from "Mi cuenta", which asks for the current one.
  if (id === actor.id) return NextResponse.json({ error: "Cambia tu propia contraseña desde Mi cuenta" }, { status: 400 });
  const password = generatePassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedAttempts: 0, lockedUntil: null, sessionVersion: { increment: 1 } },
  });
  await audit("users.resetPassword", { userId: actor.id, entity: "User", entityId: id });
  return NextResponse.json({ temporaryPassword: password });
});
