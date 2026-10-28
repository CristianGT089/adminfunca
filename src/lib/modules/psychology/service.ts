/**
 * Rules for psychological consultation requests. The endpoints validate, call here and audit.
 * This is where it is decided what is encrypted and what each person sees:
 * - Whoever only does follow-up (assistant, coordinations) sees the status, the name and the appointment.
 * - Psychologists also see contact details and reason; the clinical observation is only seen by
 *   the psychologist the case is assigned to.
 */
import type { Prisma, ConsultationRequest, User } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/core/prisma";
import { encrypt, decrypt, mask, searchHash, normalizeCode } from "@/lib/core/crypto";
import { BusinessError } from "@/lib/core/http";
import { hasPermission } from "@/lib/core/permissions";
import { isInstitutionalEmail, sendMail } from "@/lib/core/mail";
import { ensureMonthEditable, hoursBetween } from "@/lib/modules/schedule/service";
import { MODALITY_NAME } from "@/lib/modules/schedule/schemas";
import {
  countsTowardLimit,
  statusAfterFeedback,
  OPEN_STATUSES,
  MONTHLY_LIMIT,
  POLICY_VERSION,
  type ScheduleInput,
  type FeedbackInput,
  type RequestInput,
  type RequestStatus,
} from "./schemas";

const LINK_VALIDITY_HOURS = 24;

const include = {
  assignedTo: { select: { id: true, name: true } },
  registeredBy: { select: { id: true, name: true } },
  event: { select: { id: true, startsAt: true, endsAt: true, modality: true, campus: true, location: true } },
} as const;
type RequestDb = ConsultationRequest & {
  assignedTo: { id: string; name: string } | null;
  registeredBy: { id: string; name: string } | null;
  event: { id: string; startsAt: Date; endsAt: Date; modality: string; campus: string | null; location: string | null } | null;
};

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function toPublicRequest(r: RequestDb, user: Pick<User, "id" | "role">) {
  const professional = hasPermission(user.role, "psychology.attend");
  const isOwn = r.assignedToId === user.id;
  const base = {
    id: r.id,
    number: r.number,
    status: r.status as RequestStatus,
    origin: r.origin,
    requesterType: r.requesterType,
    fullName: `${r.firstNames} ${r.lastNames}`.trim(),
    document: `${r.documentType} ${mask(r.documentLast4)}`,
    program: r.program,
    campus: r.campus,
    createdAt: r.createdAt.toISOString(),
    takenAt: r.takenAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    assignedTo: r.assignedTo,
    registeredBy: r.registeredBy,
    appointment: r.event
      ? { startsAt: r.event.startsAt.toISOString(), endsAt: r.event.endsAt.toISOString(), modality: r.event.modality, campus: r.event.campus, location: r.event.location }
      : null,
    cancellationReason: r.cancellationReason,
    isMine: isOwn,
  };
  if (!professional) return { ...base, detail: null };
  return {
    ...base,
    detail: {
      document: `${r.documentType} ${decrypt(r.documentEncrypted) ?? mask(r.documentLast4)}`,
      phone: decrypt(r.phoneEncrypted),
      email: r.email,
      preferredModality: r.preferredModality,
      availability: r.availability,
      reason: decrypt(r.reasonEncrypted),
      previousId: r.previousId,
      feedback: r.attendance
        ? {
            attendance: r.attendance,
            referral: r.referral,
            reasonCategory: r.reasonCategory,
            needsFollowUp: r.needsFollowUp,
            followUpDate: r.followUpDate?.toISOString().slice(0, 10) ?? null,
            // The clinical note belongs only to the psychologist handling the case.
            observation: isOwn ? decrypt(r.observationEncrypted) : null,
          }
        : null,
    },
  };
}
export type PublicRequest = ReturnType<typeof toPublicRequest>;

/** Requests for that document in the current calendar month that count towards the limit. */
async function requestsThisMonth(documentHash: string, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const list = await prisma.consultationRequest.findMany({ where: { documentHash, createdAt: { gte: monthStart } }, select: { status: true, tokenExpiresAt: true } });
  return list.filter((r) => countsTowardLimit({ status: r.status as RequestStatus, tokenExpiresAt: r.tokenExpiresAt }, now)).length;
}

/**
 * Creates a request. Through the public link it requires an institutional email, a single open
 * request per document, and it waits for email confirmation. In every case the monthly request
 * limit applies.
 */
export async function createRequest(data: RequestInput, options: { origin: "PUBLIC" | "INTERNAL"; registeredById?: string }) {
  const document = normalizeCode(data.document);
  const documentHash = searchHash(document);
  const isPublic = options.origin === "PUBLIC";

  if (isPublic && !isInstitutionalEmail(data.email)) throw new BusinessError("Use su correo institucional de FUNCA: allí le llegará el enlace para confirmar la solicitud");
  const overLimit = (await requestsThisMonth(documentHash)) >= MONTHLY_LIMIT;
  if (isPublic) {
    // On the public link a refusal must look like a success: telling the visitor that a
    // document already has requests would reveal that someone is seeing Psychology.
    const open = await prisma.consultationRequest.findFirst({
      where: { documentHash, status: { in: OPEN_STATUSES }, OR: [{ status: { not: "PENDING_VERIFICATION" } }, { tokenExpiresAt: { gt: new Date() } }] },
    });
    if (overLimit || open) return { request: null, token: null, blocked: overLimit ? ("monthlyLimit" as const) : ("openRequest" as const) };
  } else if (overLimit) {
    throw new BusinessError(`Este documento ya tiene ${MONTHLY_LIMIT} solicitudes este mes, que es el máximo permitido`, 429);
  }

  const person = await prisma.person.findUnique({ where: { documentHash }, select: { id: true } });
  const token = isPublic ? randomBytes(32).toString("base64url") : null;
  const request = await prisma.consultationRequest.create({
    data: {
      status: isPublic ? "PENDING_VERIFICATION" : "PENDING",
      origin: options.origin,
      requesterType: data.requesterType,
      firstNames: data.firstNames,
      lastNames: data.lastNames,
      documentType: data.documentType,
      documentHash,
      documentEncrypted: encrypt(document),
      documentLast4: document.slice(-4),
      phoneEncrypted: encrypt(data.phone),
      email: data.email,
      program: data.program,
      campus: data.campus ?? null,
      preferredModality: data.preferredModality ?? null,
      availability: data.availability,
      reasonEncrypted: data.reason ? encrypt(data.reason) : null,
      personId: person?.id ?? null,
      policyVersion: POLICY_VERSION,
      policyAcceptedAt: new Date(),
      tokenHash: token ? hashToken(token) : null,
      tokenExpiresAt: token ? new Date(Date.now() + LINK_VALIDITY_HOURS * 3600000) : null,
      registeredById: options.registeredById ?? null,
    },
    include,
  });
  return { request, token, blocked: null };
}

export async function sendConfirmation(r: Pick<ConsultationRequest, "email" | "firstNames" | "number">, link: string) {
  await sendMail({
    to: r.email,
    subject: `Confirme su solicitud de cita con Psicología (#${r.number})`,
    text: [
      `Hola, ${r.firstNames}:`,
      "",
      "Recibimos su solicitud de cita con el área de Psicología de FUNCA. Para que llegue a las psicólogas, confírmela en este enlace:",
      "",
      link,
      "",
      `El enlace vence en ${LINK_VALIDITY_HOURS} horas. Si usted no hizo esta solicitud, ignore este mensaje.`,
      "",
      "FUNCA · Bienestar",
    ].join("\n"),
  });
}

/** Confirms the email of the public link: the request moves to the psychology inbox. */
export async function confirmEmail(token: string) {
  const r = await prisma.consultationRequest.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!r || r.status !== "PENDING_VERIFICATION") throw new BusinessError("El enlace no es válido o ya se usó", 404);
  if (!r.tokenExpiresAt || r.tokenExpiresAt < new Date()) throw new BusinessError("El enlace venció. Haga la solicitud de nuevo", 410);
  return prisma.consultationRequest.update({ where: { id: r.id }, data: { status: "PENDING", emailVerifiedAt: new Date(), tokenHash: null, tokenExpiresAt: null } });
}

export async function listRequests(filter: { status?: RequestStatus; assignedToId?: string; q?: string; open?: boolean; month?: { year: number; month: number } }) {
  const where: Prisma.ConsultationRequestWhereInput = {
    ...(filter.status ? { status: filter.status } : filter.open ? { status: { in: OPEN_STATUSES } } : {}),
    ...(filter.assignedToId ? { assignedToId: filter.assignedToId } : {}),
    ...(filter.month ? { createdAt: { gte: new Date(filter.month.year, filter.month.month - 1, 1), lt: new Date(filter.month.year, filter.month.month, 1) } } : {}),
  };
  const q = filter.q?.trim();
  if (q) {
    const number = Number(q.replace(/^#/, ""));
    where.OR = [
      { firstNames: { contains: q, mode: "insensitive" } },
      { lastNames: { contains: q, mode: "insensitive" } },
      { documentHash: searchHash(q) },
      ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
    ];
  }
  return prisma.consultationRequest.findMany({ where, orderBy: [{ createdAt: "desc" }], take: 300, include });
}

export async function getRequest(id: string) {
  return prisma.consultationRequest.findUnique({ where: { id }, include });
}

async function requestOrError(id: string) {
  const r = await getRequest(id);
  if (!r) throw new BusinessError("Solicitud no encontrada", 404);
  return r;
}

/**
 * The psychologist takes an unassigned request. The condition goes in the UPDATE so that, if two
 * take it at the same time, only one wins.
 */
export async function takeRequest(id: string, user: User) {
  const res = await prisma.consultationRequest.updateMany({ where: { id, status: "PENDING", assignedToId: null }, data: { status: "TAKEN", assignedToId: user.id, takenAt: new Date() } });
  if (res.count === 0) {
    const r = await requestOrError(id);
    throw new BusinessError(r.assignedTo ? `Ya la tomó ${r.assignedTo.name}` : "La solicitud ya no está disponible", 409);
  }
  return requestOrError(id);
}

function ensureAssigned(r: RequestDb, user: User) {
  if (r.assignedToId !== user.id) throw new BusinessError(r.assignedTo ? `Este caso lo lleva ${r.assignedTo.name}` : "Primero tome la solicitud", 403);
}

/** Returns the case to the inbox (only if it has no appointment yet). */
export async function releaseRequest(id: string, user: User) {
  const r = await requestOrError(id);
  ensureAssigned(r, user);
  if (r.status !== "TAKEN") throw new BusinessError("Solo se puede devolver un caso que aún no tiene cita");
  return prisma.consultationRequest.update({ where: { id }, data: { status: "PENDING", assignedToId: null, takenAt: null }, include });
}

/** Sets the appointment time agreed with the person: creates or moves the schedule entry. */
export async function scheduleRequest(id: string, data: ScheduleInput, user: User) {
  let r = await requestOrError(id);
  if (r.status === "PENDING") r = await takeRequest(id, user);
  ensureAssigned(r, user);
  if (r.status !== "TAKEN" && r.status !== "SCHEDULED") throw new BusinessError("Esta solicitud ya está cerrada");
  if (!user.personId) throw new BusinessError("Su cuenta no está vinculada a una persona; pida al administrador que la vincule para poder programar citas", 409);

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  await ensureMonthEditable(startsAt, ...(r.event ? [r.event.startsAt] : []));
  const clash = await prisma.event.findFirst({
    where: {
      teacherId: user.personId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(r.eventId ? { id: { not: r.eventId } } : {}),
      OR: [{ completion: null }, { completion: { not: "CANCELLED" } }],
    },
    select: { title: true, startsAt: true },
  });
  if (clash) throw new BusinessError(`Ya tiene "${clash.title}" a esa hora (${clash.startsAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })})`, 409);

  const fields = {
    type: "PSYCHOLOGY_SESSION" as const,
    // Without the name: more people see the schedule than the case.
    title: `Consulta psicológica #${r.number}`,
    startsAt,
    endsAt,
    hours: hoursBetween(startsAt, endsAt),
    modality: data.modality,
    campus: data.campus,
    location: data.location,
    teacherId: user.personId,
    payable: true,
  };
  const updated = await prisma.$transaction(async (tx) => {
    const event = r.eventId ? await tx.event.update({ where: { id: r.eventId }, data: fields }) : await tx.event.create({ data: { ...fields, createdById: user.id } });
    return tx.consultationRequest.update({ where: { id }, data: { status: "SCHEDULED", eventId: event.id }, include });
  });

  if (data.notify) {
    const when = startsAt.toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
    const where =
      data.modality === "VIRTUAL"
        ? data.location
          ? `Enlace: ${data.location}`
          : "Le enviaremos el enlace de la reunión."
        : [data.campus && `Sede ${data.campus}`, data.location].filter(Boolean).join(" · ");
    await sendMail({
      to: r.email,
      subject: r.event ? `Su cita con Psicología cambió de hora (#${r.number})` : `Su cita con Psicología quedó programada (#${r.number})`,
      text: [
        `Hola, ${r.firstNames}:`,
        "",
        `Su cita quedó para el ${when} (${MODALITY_NAME[data.modality].toLowerCase()}).`,
        where,
        "",
        `Atiende: ${user.name}.`,
        "Si no puede asistir, avise con anticipación respondiendo a la psicóloga por el medio en que la contactó.",
        "",
        "FUNCA · Bienestar",
      ]
        .filter((l) => l !== undefined)
        .join("\n"),
    }).catch((e) => console.error("Could not send the appointment notice by email", e));
  }
  return updated;
}

/** Feedback after the appointment time. It can be corrected while the month is not approved. */
export async function recordFeedback(id: string, data: FeedbackInput, user: User) {
  const r = await requestOrError(id);
  ensureAssigned(r, user);
  if (!r.event) throw new BusinessError("La solicitud aún no tiene cita programada");
  if (r.event.startsAt > new Date()) throw new BusinessError("La retroalimentación se registra después de la hora de inicio de la cita");
  await ensureMonthEditable(r.event.startsAt);
  const status = statusAfterFeedback(data);
  return prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: r.event!.id },
      // No-shows and late cancellations also count as hours: the time was reserved.
      data: { completion: data.attendance === "ATTENDED" ? "COMPLETED" : "NOT_COMPLETED", closedAt: new Date(), closedById: user.id, closingNote: null },
    });
    return tx.consultationRequest.update({
      where: { id },
      data: {
        status,
        attendance: data.attendance,
        referral: data.attendance === "ATTENDED" ? data.referral : "NONE",
        reasonCategory: data.reasonCategory ?? null,
        needsFollowUp: data.needsFollowUp,
        followUpDate: data.needsFollowUp && data.followUpDate ? new Date(`${data.followUpDate}T00:00:00`) : null,
        observationEncrypted: data.observation === undefined ? undefined : data.observation ? encrypt(data.observation) : null,
        closedAt: new Date(),
      },
      include,
    });
  });
}

/**
 * Cancels an open request. The psychologist can cancel any of them; staff who only register,
 * only the ones nobody has taken. If the appointment was in the future it is removed from the schedule.
 */
export async function cancelRequest(id: string, reason: string, user: User) {
  const r = await requestOrError(id);
  if (!OPEN_STATUSES.includes(r.status as RequestStatus)) throw new BusinessError("La solicitud ya está cerrada");
  const professional = hasPermission(user.role, "psychology.attend");
  if (!professional && r.status !== "PENDING" && r.status !== "PENDING_VERIFICATION") throw new BusinessError("La solicitud ya la tomó una psicóloga; pídale a ella que la cancele", 403);
  if (professional && r.assignedToId && r.assignedToId !== user.id) throw new BusinessError(`Este caso lo lleva ${r.assignedTo?.name}`, 403);
  return prisma.$transaction(async (tx) => {
    if (r.event) {
      await ensureMonthEditable(r.event.startsAt);
      if (r.event.startsAt > new Date()) await tx.event.delete({ where: { id: r.event.id } });
      else await tx.event.update({ where: { id: r.event.id }, data: { completion: "CANCELLED", closedAt: new Date(), closedById: user.id } });
    }
    return tx.consultationRequest.update({ where: { id }, data: { status: "CANCELLED", cancellationReason: reason, closedAt: new Date(), tokenHash: null }, include });
  });
}

/** Opens a follow-up case with the same data, already assigned to the psychologist. It does not count towards the public link's monthly limit. */
export async function createFollowUp(id: string, user: User) {
  const r = await requestOrError(id);
  ensureAssigned(r, user);
  // Only from a case that already had its appointment (the UI hides the button otherwise).
  if (!["ATTENDED", "REFERRED", "NO_SHOW"].includes(r.status)) throw new BusinessError("El seguimiento se abre desde un caso ya atendido");
  return prisma.consultationRequest.create({
    data: {
      status: "TAKEN",
      origin: "FOLLOW_UP",
      requesterType: r.requesterType,
      firstNames: r.firstNames,
      lastNames: r.lastNames,
      documentType: r.documentType,
      documentHash: r.documentHash,
      documentEncrypted: r.documentEncrypted,
      documentLast4: r.documentLast4,
      phoneEncrypted: r.phoneEncrypted,
      email: r.email,
      program: r.program,
      campus: r.campus,
      preferredModality: r.preferredModality,
      availability: r.availability,
      personId: r.personId,
      policyVersion: r.policyVersion,
      policyAcceptedAt: r.policyAcceptedAt,
      registeredById: user.id,
      assignedToId: user.id,
      takenAt: new Date(),
      previousId: r.id,
    },
    include,
  });
}

/** Counts by status for the inbox indicators. */
export async function countByStatus(userId?: string) {
  const groups = await prisma.consultationRequest.groupBy({ by: ["status"], _count: true });
  const count = Object.fromEntries(groups.map((g) => [g.status, g._count])) as Partial<Record<RequestStatus, number>>;
  const mine = userId ? await prisma.consultationRequest.count({ where: { assignedToId: userId, status: { in: ["TAKEN", "SCHEDULED"] } } }) : 0;
  const withoutFeedback = userId ? await prisma.consultationRequest.count({ where: { assignedToId: userId, status: "SCHEDULED", event: { startsAt: { lte: new Date() } } } }) : 0;
  return { count, mine, withoutFeedback };
}
