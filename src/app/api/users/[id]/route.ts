import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { withPermission, readBody, notFound, errorResponse, type IdParams } from "@/lib/core/http";
import { linkPerson } from "@/lib/core/personLink";
import { ROLES } from "@/lib/core/permissions";
import { audit } from "@/lib/core/audit";

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  active: z.boolean().optional(),
  // Link the account to the person with that document, or remove the link (null).
  link: z.object({ documentType: z.string().trim().max(5).default("CC"), document: z.string().trim().min(4).max(30) }).nullable().optional(),
});

export const PATCH = withPermission("users.manage", async (req, actor, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, schema);
  if (error) return error;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return notFound("Usuario");
  if (id === actor.id && (data.active === false || (data.role && data.role !== actor.role))) {
    return NextResponse.json({ error: "No puedes desactivarte ni cambiar tu propio rol" }, { status: 400 });
  }
  const { link, ...changes } = data;
  if (link !== undefined) {
    try {
      if (link) await linkPerson(id, { name: changes.name ?? existing.name, ...link });
      else await prisma.user.update({ where: { id }, data: { personId: null } });
    } catch (e) {
      return errorResponse(e);
    }
  }
  // A role change or deactivation ends the user's open sessions.
  const endSessions = (changes.role !== undefined && changes.role !== existing.role) || changes.active === false;
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...changes,
      role: changes.role as never,
      ...(changes.active === false ? { lockedUntil: null } : {}),
      ...(endSessions ? { sessionVersion: { increment: 1 } } : {}),
    },
    select: { id: true, name: true, username: true, role: true, active: true, personId: true },
  });
  await audit("users.update", { userId: actor.id, entity: "User", entityId: id, details: { ...changes, ...(link !== undefined ? { link: link ? `••••${link.document.slice(-4)}` : null } : {}) } });
  return NextResponse.json({ user });
});
