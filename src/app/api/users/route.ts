import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { withPermission, readBody } from "@/lib/core/http";
import { ROLES, PROFESSIONAL_ROLES } from "@/lib/core/permissions";
import { errorResponse } from "@/lib/core/http";
import { linkPerson } from "@/lib/core/personLink";
import { generatePassword, hashPassword } from "@/lib/core/passwords";
import { audit } from "@/lib/core/audit";

const selection = {
  id: true, name: true, username: true, role: true, active: true, mustChangePassword: true,
  lastLoginAt: true, createdAt: true, lockedUntil: true,
  createdBy: { select: { id: true, name: true } },
  person: { select: { id: true, firstNames: true, lastNames: true, documentLast4: true } },
} as const;

export const GET = withPermission("users.view", async () => {
  const users = await prisma.user.findMany({ select: selection, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return NextResponse.json({ users });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  username: z.string().trim().toLowerCase().min(3, "Mínimo 3 caracteres").max(40).regex(/^[a-z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo"),
  role: z.enum(ROLES as [string, ...string[]]),
  // Psychology and internships: the account is put under the name of the person with this document.
  documentType: z.string().trim().max(5).default("CC"),
  document: z.string().trim().max(30).optional().nullable(),
});

export const POST = withPermission("users.manage", async (req, actor) => {
  const { data, error } = await readBody(req, createSchema);
  if (error) return error;
  if (await prisma.user.findUnique({ where: { username: data.username } })) {
    return NextResponse.json({ error: "Ese nombre de usuario ya existe" }, { status: 409 });
  }
  if (PROFESSIONAL_ROLES.includes(data.role as never) && !data.document) {
    return NextResponse.json({ error: "Para este rol indique el documento de la persona: sus actividades se pagan a su nombre" }, { status: 400 });
  }
  const password = generatePassword();
  const created = await prisma.user.create({
    data: { name: data.name, username: data.username, role: data.role as never, passwordHash: await hashPassword(password), createdById: actor.id, mustChangePassword: true },
    select: selection,
  });
  await audit("users.create", { userId: actor.id, entity: "User", entityId: created.id, details: { role: created.role } });
  if (data.document) {
    try {
      await linkPerson(created.id, { name: data.name, documentType: data.documentType, document: data.document });
    } catch (e) {
      // The account already exists: report the link problem, which can be fixed later.
      await prisma.user.delete({ where: { id: created.id } });
      return errorResponse(e);
    }
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, select: selection });
  // The temporary password is shown only once; it is not stored in clear text.
  return NextResponse.json({ user, temporaryPassword: password }, { status: 201 });
});
