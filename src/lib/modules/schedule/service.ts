/**
 * Academic schedule: record of everything a teacher or a professional does (classes, courses,
 * diplomas, internships, sessions). Payroll adds up these entries.
 */
import type { Event, AcademicModule, Person, Prisma, PrismaClient, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/core/prisma";
import { BusinessError } from "@/lib/core/http";
import { ROLE_NAME, PROFESSIONAL_ROLES } from "@/lib/core/permissions";
import type { Completion, ClosingInput, EventEditInput, EventInput, Modality, EventType } from "./schemas";
import { atHour, SHIFT_DEFINITION, shiftSessions, type Shift } from "./shifts";

type DbEvent = Event & {
  teacher: Pick<Person, "id" | "firstNames" | "lastNames"> | null;
  module: Pick<AcademicModule, "id" | "name" | "program"> | null;
  consultationRequest?: { id: string; number: number } | null;
};

export const eventInclude = {
  teacher: { select: { id: true, firstNames: true, lastNames: true } },
  module: { select: { id: true, name: true, program: true } },
  consultationRequest: { select: { id: true, number: true } },
} as const;

export function toPublicEvent(e: DbEvent) {
  return {
    id: e.id,
    type: e.type as EventType,
    shift: (e.shift as Shift | null) ?? null,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    hours: e.hours,
    modality: e.modality as Modality,
    campus: e.campus,
    location: e.location,
    studentCount: e.studentCount,
    payable: e.payable,
    hourlyRate: e.hourlyRate,
    seriesId: e.seriesId,
    completion: (e.completion as Completion | null) ?? null,
    closingNote: e.closingNote,
    closedAt: e.closedAt?.toISOString() ?? null,
    teacher: e.teacher ? { id: e.teacher.id, fullName: `${e.teacher.firstNames} ${e.teacher.lastNames}` } : null,
    module: e.module,
    // Sessions coming from a request are managed from Psychology.
    request: e.consultationRequest ?? null,
  };
}
export type PublicEvent = ReturnType<typeof toPublicEvent>;

export const hoursBetween = (startsAt: Date, endsAt: Date) => Math.round(((endsAt.getTime() - startsAt.getTime()) / 3600000) * 100) / 100;

/** The global client or the one of an interactive transaction (`prisma.$transaction(async (tx) => …)`). */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * An entry in a month whose payroll was already approved cannot be created, changed or deleted:
 * the paid amounts must match the schedule.
 *
 * Call it with the transaction client of the write it guards: the period row is read with
 * `FOR SHARE`, so an approval of that month (which locks it `FOR UPDATE`) waits for the write to
 * commit, and a write that arrives during an approval waits and then sees it approved.
 */
export async function ensureMonthEditable(dates: Date[], db: Db = prisma) {
  const months = [...new Set(dates.map((d) => d.getFullYear() * 100 + d.getMonth() + 1))].sort((a, b) => a - b);
  for (const ym of months) {
    const year = Math.floor(ym / 100);
    const month = ym % 100;
    const rows = await db.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM payroll_periods WHERE year = ${year} AND month = ${month} FOR SHARE`;
    const status = rows[0]?.status;
    if (status === "APPROVED" || status === "PAID") {
      const name = new Date(year, month - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
      throw new BusinessError(`La nómina de ${name} ya está aprobada; no se pueden cambiar sus registros`, 409);
    }
  }
}

/** Valid person in charge: a teacher or the person linked to a professional's account. */
async function validateRelations(teacherId: string | null, moduleId: string | null, db: Db = prisma) {
  if (teacherId) {
    const t = await db.person.findUnique({ where: { id: teacherId }, include: { user: { select: { id: true } } } });
    if (!t || (t.type !== "TEACHER" && !t.user)) throw new BusinessError("El responsable no existe", 404);
  }
  if (moduleId && !(await db.academicModule.findUnique({ where: { id: moduleId } }))) throw new BusinessError("El módulo no existe", 404);
}

function eventFields(data: EventInput | EventEditInput, startsAt: Date, endsAt: Date) {
  return {
    type: data.type,
    shift: data.type === "MODULE_CLASS" ? (data.shift ?? null) : null,
    title: data.title,
    description: data.description,
    startsAt,
    endsAt,
    hours: data.hours ?? hoursBetween(startsAt, endsAt),
    modality: data.modality,
    campus: data.campus,
    location: data.location,
    studentCount: data.studentCount ?? null,
    payable: data.payable,
    hourlyRate: data.hourlyRate ?? null,
    teacherId: data.teacherId,
    moduleId: data.type === "MODULE_CLASS" ? data.moduleId : null,
  };
}

/** Start dates of each session according to the requested repetition. */
function sessionDates(data: EventInput): { dates: [Date, Date][] } {
  if (data.byShift) {
    const { shift, from, until } = data.byShift;
    const def = SHIFT_DEFINITION[shift];
    const days = shiftSessions(shift, new Date(`${from}T00:00:00`), new Date(`${until}T00:00:00`));
    if (days.length === 0) throw new BusinessError("Entre esas fechas no cae ningún día de la jornada elegida");
    return { dates: days.map((d) => [atHour(d, def.startHour), atHour(d, def.endHour)]) };
  }

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  const duration = endsAt.getTime() - startsAt.getTime();
  const dates: Date[] = [startsAt];

  if (data.repeat) {
    const limit = new Date(`${data.repeat.until}T23:59:59`);
    if (limit < startsAt) throw new BusinessError("La fecha final de la repetición debe ser posterior al inicio");
    const days = new Set(data.repeat.days);
    const cursor = new Date(startsAt);
    cursor.setDate(cursor.getDate() + 1);
    let n = 0;
    while (cursor <= limit && n < 200) {
      if (days.has(cursor.getDay())) {
        dates.push(new Date(cursor));
        n++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (!days.has(startsAt.getDay())) dates.shift();
    if (dates.length === 0) throw new BusinessError("Ningún día coincide con la repetición indicada");
  }
  return { dates: dates.map((d) => [d, new Date(d.getTime() + duration)]) };
}

/** A series can have up to ~200 sessions: more time than the 5 s default for its transaction. */
const LONG_TRANSACTION = { timeout: 30_000 };

/** Creates the event and, if it has weekly repetition or a shift, one session per day. */
export async function createEvents(data: EventInput, createdById: string) {
  const { dates } = sessionDates(data);
  const base = data.byShift ? { ...data, shift: data.byShift.shift, hours: null } : data;
  const seriesId = dates.length > 1 ? randomUUID() : null;
  return prisma.$transaction(async (tx) => {
    await validateRelations(data.teacherId, data.moduleId, tx);
    await ensureMonthEditable(
      dates.map(([s]) => s),
      tx
    );
    if (!seriesId) return [await tx.event.create({ data: { ...eventFields(base, dates[0][0], dates[0][1]), seriesId, createdById }, include: eventInclude })];
    await tx.event.createMany({ data: dates.map(([start, end]) => ({ ...eventFields(base, start, end), seriesId, createdById })) });
    return tx.event.findMany({ where: { seriesId }, orderBy: { startsAt: "asc" }, include: eventInclude });
  }, LONG_TRANSACTION);
}

export async function getEvent(id: string, db: Db = prisma) {
  return db.event.findUnique({ where: { id }, include: eventInclude });
}

/**
 * Check the endpoint makes on the entry (who may touch it). It runs again inside the transaction,
 * on the row read there, so a change made in between (another type, another person) is noticed.
 */
export type EventGuard = (e: DbEvent) => boolean;

async function currentEvent(id: string, db: Db, guard?: EventGuard) {
  const current = await getEvent(id, db);
  if (!current) throw new BusinessError("Evento no encontrado", 404);
  if (guard && !guard(current)) throw new BusinessError("No tienes permiso para esta acción", 403);
  notFromRequest(current);
  return current;
}

function notFromRequest(e: { consultationRequest?: { number: number } | null }) {
  if (e.consultationRequest) throw new BusinessError(`Esta consulta viene de la solicitud #${e.consultationRequest.number}: se cambia desde Psicología`, 409);
}

export async function updateEvent(id: string, data: EventEditInput, guard?: EventGuard) {
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  return prisma.$transaction(async (tx) => {
    const current = await currentEvent(id, tx, guard);
    await validateRelations(data.teacherId, data.moduleId, tx);

    if (data.scope === "series" && current.seriesId) {
      // The whole series: each session keeps its date; time, duration and the other data change.
      const sessions = await tx.event.findMany({ where: { seriesId: current.seriesId }, select: { id: true, startsAt: true, consultationRequest: { select: { number: true } } } });
      sessions.forEach(notFromRequest);
      await ensureMonthEditable(
        sessions.map((s) => s.startsAt),
        tx
      );
      const duration = endsAt.getTime() - startsAt.getTime();
      for (const s of sessions) {
        const start = new Date(s.startsAt);
        start.setHours(startsAt.getHours(), startsAt.getMinutes(), 0, 0);
        const fields = eventFields(data, start, new Date(start.getTime() + duration));
        await tx.event.update({ where: { id: s.id }, data: { ...fields, hours: data.hours ?? fields.hours } });
      }
      return tx.event.findUniqueOrThrow({ where: { id }, include: eventInclude });
    }
    await ensureMonthEditable([current.startsAt, startsAt], tx);
    return tx.event.update({ where: { id }, data: eventFields(data, startsAt, endsAt), include: eventInclude });
  }, LONG_TRANSACTION);
}

export async function deleteEvent(id: string, scope: "one" | "series", guard?: EventGuard) {
  return prisma.$transaction(async (tx) => {
    const current = await currentEvent(id, tx, guard);
    if (scope === "series" && current.seriesId) {
      const where = { seriesId: current.seriesId, startsAt: { gte: current.startsAt } };
      const sessions = await tx.event.findMany({ where, select: { startsAt: true, consultationRequest: { select: { number: true } } } });
      // No session of the series may come from a psychology request (same rule as for a single one).
      sessions.forEach(notFromRequest);
      await ensureMonthEditable(
        sessions.map((s) => s.startsAt),
        tx
      );
      const r = await tx.event.deleteMany({ where });
      return r.count;
    }
    await ensureMonthEditable([current.startsAt], tx);
    await tx.event.delete({ where: { id } });
    return 1;
  });
}

/** Records whether the activity took place. Only after its start time. */
export async function closeEvent(id: string, data: ClosingInput, userId: string, guard?: EventGuard) {
  return prisma.$transaction(async (tx) => {
    const current = await currentEvent(id, tx, guard);
    if (current.startsAt > new Date()) throw new BusinessError("El cierre se registra cuando la actividad ya empezó");
    await ensureMonthEditable([current.startsAt], tx);
    return tx.event.update({
      where: { id },
      data: { completion: data.completion, closingNote: data.note, closedAt: new Date(), closedById: userId },
      include: eventInclude,
    });
  });
}

export async function listEvents(filter: { from: Date; to: Date; teacherId?: string; type?: EventType; types?: EventType[] }) {
  const where: Prisma.EventWhereInput = {
    startsAt: { lt: filter.to },
    endsAt: { gt: filter.from },
    ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
    ...(filter.type ? { type: filter.type } : filter.types ? { type: { in: filter.types } } : {}),
  };
  return prisma.event.findMany({ where, orderBy: { startsAt: "asc" }, include: eventInclude });
}

/** People an entry can be assigned to: teachers and professionals with an account. */
export async function listAssignees() {
  const people = await prisma.person.findMany({
    where: {
      active: true,
      OR: [{ type: "TEACHER" }, { user: { active: true, role: { in: PROFESSIONAL_ROLES } } }],
    },
    orderBy: [{ lastNames: "asc" }, { firstNames: "asc" }],
    include: { user: { select: { role: true } }, teachingModules: { select: { moduleId: true } } },
  });
  return people.map((p) => ({
    id: p.id,
    firstNames: p.firstNames,
    lastNames: p.lastNames,
    program: p.program,
    role: p.user ? ROLE_NAME[p.user.role as Role] : "Docente",
    moduleIds: p.teachingModules.map((m) => m.moduleId),
  }));
}
export type Assignee = Awaited<ReturnType<typeof listAssignees>>[number];
