/**
 * Academic schedule: record of everything a teacher or a professional does (classes, courses,
 * diplomas, internships, sessions). Payroll adds up these entries.
 */
import type { Event, AcademicModule, Person, Prisma, Role } from "@prisma/client";
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

/**
 * An entry in a month whose payroll was already approved cannot be created, changed or deleted:
 * the paid amounts must match the schedule.
 */
export async function ensureMonthEditable(...dates: Date[]) {
  for (const d of dates) {
    const period = await prisma.payrollPeriod.findUnique({ where: { year_month: { year: d.getFullYear(), month: d.getMonth() + 1 } } });
    if (period && (period.status === "APPROVED" || period.status === "PAID")) {
      throw new BusinessError(`La nómina de ${d.toLocaleDateString("es-CO", { month: "long", year: "numeric" })} ya está aprobada; no se pueden cambiar sus registros`, 409);
    }
  }
}

/** Valid person in charge: a teacher or the person linked to a professional's account. */
async function validateRelations(teacherId: string | null, moduleId: string | null) {
  if (teacherId) {
    const t = await prisma.person.findUnique({ where: { id: teacherId }, include: { user: { select: { id: true } } } });
    if (!t || (t.type !== "TEACHER" && !t.user)) throw new BusinessError("El responsable no existe", 404);
  }
  if (moduleId && !(await prisma.academicModule.findUnique({ where: { id: moduleId } }))) throw new BusinessError("El módulo no existe", 404);
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

/** Creates the event and, if it has weekly repetition or a shift, one session per day. */
export async function createEvents(data: EventInput, createdById: string) {
  await validateRelations(data.teacherId, data.moduleId);
  const { dates } = sessionDates(data);
  await ensureMonthEditable(...new Set(dates.map(([s]) => new Date(s.getFullYear(), s.getMonth(), 1))));
  const base = data.byShift ? { ...data, shift: data.byShift.shift, hours: null } : data;
  const seriesId = dates.length > 1 ? randomUUID() : null;
  return prisma.$transaction(
    dates.map(([start, end]) =>
      prisma.event.create({
        data: { ...eventFields(base, start, end), seriesId, createdById },
        include: eventInclude,
      })
    )
  );
}

export async function getEvent(id: string) {
  return prisma.event.findUnique({ where: { id }, include: eventInclude });
}

function notFromRequest(e: { consultationRequest?: { number: number } | null }) {
  if (e.consultationRequest) throw new BusinessError(`Esta consulta viene de la solicitud #${e.consultationRequest.number}: se cambia desde Psicología`, 409);
}

export async function updateEvent(id: string, data: EventEditInput) {
  const current = await getEvent(id);
  if (!current) throw new BusinessError("Evento no encontrado", 404);
  notFromRequest(current);
  await validateRelations(data.teacherId, data.moduleId);
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);

  if (data.scope === "series" && current.seriesId) {
    // The whole series: each session keeps its date; time, duration and the other data change.
    const sessions = await prisma.event.findMany({ where: { seriesId: current.seriesId } });
    await ensureMonthEditable(...sessions.map((s) => s.startsAt));
    const duration = endsAt.getTime() - startsAt.getTime();
    await prisma.$transaction(
      sessions.map((s) => {
        const start = new Date(s.startsAt);
        start.setHours(startsAt.getHours(), startsAt.getMinutes(), 0, 0);
        const fields = eventFields(data, start, new Date(start.getTime() + duration));
        return prisma.event.update({ where: { id: s.id }, data: { ...fields, hours: data.hours ?? fields.hours } });
      })
    );
    return prisma.event.findUniqueOrThrow({ where: { id }, include: eventInclude });
  }
  await ensureMonthEditable(current.startsAt, startsAt);
  return prisma.event.update({ where: { id }, data: eventFields(data, startsAt, endsAt), include: eventInclude });
}

export async function deleteEvent(id: string, scope: "one" | "series") {
  const current = await getEvent(id);
  if (!current) throw new BusinessError("Evento no encontrado", 404);
  notFromRequest(current);
  if (scope === "series" && current.seriesId) {
    const where = { seriesId: current.seriesId, startsAt: { gte: current.startsAt } };
    const sessions = await prisma.event.findMany({ where, select: { startsAt: true, consultationRequest: { select: { number: true } } } });
    // No session of the series may come from a psychology request (same rule as for a single one).
    sessions.forEach(notFromRequest);
    await ensureMonthEditable(...sessions.map((s) => s.startsAt));
    const r = await prisma.event.deleteMany({ where });
    return r.count;
  }
  await ensureMonthEditable(current.startsAt);
  await prisma.event.delete({ where: { id } });
  return 1;
}

/** Records whether the activity took place. Only after its start time. */
export async function closeEvent(id: string, data: ClosingInput, userId: string) {
  const current = await getEvent(id);
  if (!current) throw new BusinessError("Evento no encontrado", 404);
  notFromRequest(current);
  if (current.startsAt > new Date()) throw new BusinessError("El cierre se registra cuando la actividad ya empezó");
  await ensureMonthEditable(current.startsAt);
  return prisma.event.update({
    where: { id },
    data: { completion: data.completion, closingNote: data.note, closedAt: new Date(), closedById: userId },
    include: eventInclude,
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
