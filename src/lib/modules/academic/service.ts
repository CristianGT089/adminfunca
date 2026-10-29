import type { AcademicModule, Person, User } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { BusinessError } from "@/lib/core/http";
import { createPerson, isUniqueViolation, toPublicPerson, updatePerson, type Db } from "@/lib/modules/inventory/service";
import type { ModuleInput, TeacherInput } from "./schemas";

/** Business-rule error of the academic module (teachers and modules). */
export class AcademicError extends BusinessError {}

const MODULE_EXISTS = "Ya existe ese módulo en ese programa";

/** A unique violation that slipped past the pre-check (two simultaneous requests) → same 409. */
async function moduleUniqueOr409<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AcademicError(MODULE_EXISTS, 409);
    throw e;
  }
}

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
  if (exists) throw new AcademicError(MODULE_EXISTS, 409);
  return moduleUniqueOr409(() =>
    prisma.academicModule.create({ data: { name: data.name, program: data.program, hours: data.hours ?? null }, include: { _count: { select: { teachers: true } } } })
  );
}

export async function updateModule(id: string, data: ModuleInput) {
  const clash = await prisma.academicModule.findFirst({ where: { program: data.program, name: data.name, id: { not: id } } });
  if (clash) throw new AcademicError(MODULE_EXISTS, 409);
  return moduleUniqueOr409(() =>
    prisma.academicModule.update({
      where: { id },
      data: { name: data.name, program: data.program, hours: data.hours ?? null, ...(data.active !== undefined ? { active: data.active } : {}) },
      include: { _count: { select: { teachers: true } } },
    })
  );
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

/** Replaces the teacher's modules (unknown ids are ignored). Runs inside the caller's transaction. */
async function assignModules(tx: Db, personId: string, moduleIds: string[]) {
  const valid = await tx.academicModule.findMany({ where: { id: { in: moduleIds } }, select: { id: true } });
  await tx.teacherModule.deleteMany({ where: { personId } });
  await tx.teacherModule.createMany({ data: valid.map((m) => ({ personId, moduleId: m.id })) });
}

/** The person and their modules are written in one transaction: either both or neither. */
export async function createTeacher(data: TeacherInput) {
  const { moduleIds, ...person } = data;
  const id = await prisma.$transaction(async (tx) => {
    const created = await createPerson({ ...person, type: "TEACHER" }, tx);
    await assignModules(tx, created.id, moduleIds);
    return created.id;
  });
  return (await getTeacher(id))!;
}

export async function updateTeacher(id: string, data: TeacherInput) {
  const { moduleIds, ...person } = data;
  await prisma.$transaction(async (tx) => {
    const current = await tx.person.findUnique({ where: { id }, select: { type: true } });
    if (current?.type !== "TEACHER") throw new AcademicError("Docente no encontrado", 404);
    await updatePerson(id, { ...person, type: "TEACHER" }, tx);
    await assignModules(tx, id, moduleIds);
  });
  return (await getTeacher(id))!;
}
