import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { withPermission, readBody, notFound, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { personSchema } from "@/lib/modules/inventory/schemas";
import { updatePerson, InventoryError, listLoans, toPublicPerson, toPublicLoan } from "@/lib/modules/inventory/service";

export const GET = withPermission("inventory.people.view", async (_req, user, { params }: IdParams) => {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id }, include: { _count: { select: { loans: { where: { returnedAt: null } } } } } });
  if (!person) return notFound("Persona");
  const loans = await listLoans({ personId: id, limit: 50 });
  await audit("people.view", { userId: user.id, entity: "Person", entityId: id });
  return NextResponse.json({ person: toPublicPerson(person, user), loans: loans.map((p) => toPublicLoan(p, user)) });
});

const partialSchema = personSchema.partial().extend({ active: z.boolean().optional() });

export const PATCH = withPermission("inventory.people.manage", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, partialSchema);
  if (error) return error;
  const current = await prisma.person.findUnique({ where: { id } });
  if (!current) return notFound("Persona");
  try {
    let person = current;
    if (data.active !== undefined && Object.keys(data).length === 1) {
      person = await prisma.person.update({ where: { id }, data: { active: data.active } });
    } else {
      // Full edit: the form sends every field (the document comes in clear text only if it changed).
      const full = personSchema.safeParse(data);
      if (!full.success) return NextResponse.json({ error: "Faltan campos para editar la persona" }, { status: 400 });
      person = await updatePerson(id, full.data);
      if (data.active !== undefined) person = await prisma.person.update({ where: { id }, data: { active: data.active } });
    }
    await audit("people.update", { userId: user.id, entity: "Person", entityId: id, details: { fields: Object.keys(data) } });
    return NextResponse.json({ person: toPublicPerson(person, user) });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
