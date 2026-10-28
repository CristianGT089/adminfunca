import type { AcademicModule, Person, User } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { createPerson, InventoryError, toPublicPerson, updatePerson } from "@/lib/modules/inventory/service";
import type { ModuleInput, TeacherInput } from "./schemas";

export function toPublicModule(m: AcademicModule & { _count?: { teachers: number } }) {
  return { id: m.id, name: m.name, program: m.program, hours: m.hours, active: m.active, teachers: m._count?.teachers ?? 0 };
}
export type PublicModule = ReturnType<typeof toPublicModule>;

export async function listModules(activeOnly = false) {
  return prisma.academicModule.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ program: "asc" }, { name: "asc" }],
    include: { _count: { select: { teachers: true } } },
  });
}

export async function createModule(data: ModuleInput) {
  const exists = await prisma.academicModule.findUnique({ where: { program_name: { program: data.program, name: data.name } } });
  if (exists) throw new InventoryError("Ya existe ese módulo en ese programa", 409);
  return prisma.academicModule.create({ data: { name: data.name, program: data.program, hours: data.hours ?? null }, include: { _count: { select: { teachers: true } } } });
}

export async function updateModule(id: string, data: ModuleInput) {
  const clash = await prisma.academicModule.findFirst({ where: { program: data.program, name: data.name, id: { not: id } } });
  if (clash) throw new InventoryError("Ya existe ese módulo en ese programa", 409);
  return prisma.academicModule.update({
    where: { id },
    data: { name: data.name, program: data.program, hours: data.hours ?? null, ...(data.active !== undefined ? { active: data.active } : {}) },
    include: { _count: { select: { teachers: true } } },
  });
}

// ------------------------------------------------------------------ Teachers

const teacherInclude = { teachingModules: { include: { module: true } }, _count: { select: { loans: { where: { returnedAt: null } } } } } as const;
type TeacherRecord = Person & { teachingModules: { module: AcademicModule }[]; _count?: { loans: number } };

export function toPublicTeacher(t: TeacherRecord, user: Pick<User, "role">) {
  return { ...toPublicPerson(t, user), modules: t.teachingModules.map((x) => toPublicModule(x.module)) };
}
export type PublicTeacher = ReturnType<typeof toPublicTeacher>;

export async function listTeachers(q = "") {
  const text = q.trim();
  return prisma.person.findMany({
    where: {
      type: "TEACHER",
      ...(text
        ? {
            OR: [
              { firstNames: { contains: text, mode: "insensitive" } },
              { lastNames: { contains: text, mode: "insensitive" } },
              { program: { contains: text, mode: "insensitive" } },
              { teachingModules: { some: { module: { name: { contains: text, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastNames: "asc" }, { firstNames: "asc" }],
    include: teacherInclude,
  });
}

export async function getTeacher(id: string) {
  const t = await prisma.person.findUnique({ where: { id }, include: teacherInclude });
  return t && t.type === "TEACHER" ? t : null;
}

async function assignModules(personId: string, moduleIds: string[]) {
  const valid = await prisma.academicModule.findMany({ where: { id: { in: moduleIds } }, select: { id: true } });
  await prisma.$transaction([
    prisma.teacherModule.deleteMany({ where: { personId } }),
    prisma.teacherModule.createMany({ data: valid.map((m) => ({ personId, moduleId: m.id })) }),
  ]);
}

export async function createTeacher(data: TeacherInput) {
  const { moduleIds, ...person } = data;
  const created = await createPerson({ ...person, type: "TEACHER" });
  await assignModules(created.id, moduleIds);
  return (await getTeacher(created.id))!;
}

export async function updateTeacher(id: string, data: TeacherInput) {
  if (!(await getTeacher(id))) throw new InventoryError("Docente no encontrado", 404);
  const { moduleIds, ...person } = data;
  await updatePerson(id, { ...person, type: "TEACHER" });
  await assignModules(id, moduleIds);
  return (await getTeacher(id))!;
}
