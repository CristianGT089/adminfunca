import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { notFound, readBody, withPermission, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { teacherSchema } from "@/lib/modules/academic/schemas";
import { getTeacher, toPublicTeacher, updateTeacher } from "@/lib/modules/academic/service";
import { InventoryError } from "@/lib/modules/inventory/service";

export const GET = withPermission("teachers.view", async (_req, user, { params }: IdParams) => {
  const { id } = await params;
  const teacher = await getTeacher(id);
  if (!teacher) return notFound("Docente");
  await audit("teachers.view", { userId: user.id, entity: "Person", entityId: id });
  return NextResponse.json({ teacher: toPublicTeacher(teacher, user) });
});

const activeSchema = z.object({ active: z.boolean() });

export const PATCH = withPermission("teachers.manage", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    // Only activate/deactivate.
    const activeOnly = activeSchema.safeParse(body);
    if (activeOnly.success && body && Object.keys(body).length === 1) {
      if (!(await getTeacher(id))) return notFound("Docente");
      await prisma.person.update({ where: { id }, data: { active: activeOnly.data.active } });
      await audit("teachers.update", { userId: user.id, entity: "Person", entityId: id, details: { active: activeOnly.data.active } });
      return NextResponse.json({ teacher: toPublicTeacher((await getTeacher(id))!, user) });
    }
    const { data, error } = await readBody(new Request(req.url, { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), teacherSchema);
    if (error) return error;
    const teacher = await updateTeacher(id, data);
    await audit("teachers.update", { userId: user.id, entity: "Person", entityId: id, details: { modules: data.moduleIds.length } });
    return NextResponse.json({ teacher: toPublicTeacher(teacher, user) });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
