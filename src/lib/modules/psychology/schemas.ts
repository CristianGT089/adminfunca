/**
 * Psychology: validation and catalogs for consultation requests. No server dependencies so they
 * can also be used in the screens.
 */
import { z } from "zod";
import "@/lib/core/zodConfig";
import { MODALITIES } from "@/lib/modules/schedule/schemas";
import { CAMPUSES, DOCUMENT_TYPES } from "@/lib/modules/inventory/schemas";

/**
 * Maximum appointments per document in a calendar month. Only appointments that actually took
 * place count (see `countsTowardLimit`).
 */
export const MONTHLY_LIMIT = 3;
/** Current version of the data processing policy (changes if the text changes). */
export const POLICY_VERSION = "2026-10-28";
/** Default length of an individual session, in minutes. */
export const SESSION_MINUTES = 60;

export const REQUEST_STATUSES = ["PENDING_VERIFICATION", "PENDING", "TAKEN", "SCHEDULED", "ATTENDED", "REFERRED", "NO_SHOW", "CANCELLED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS: Record<RequestStatus, { text: string; help: string; className: string }> = {
  PENDING_VERIFICATION: { text: "Correo sin confirmar", help: "La persona aún no abre el enlace que le llegó al correo.", className: "bg-slate-100 text-slate-500" },
  PENDING: { text: "Sin asignar", help: "Ninguna psicóloga la ha tomado.", className: "bg-gold-100 text-gold-700" },
  TAKEN: { text: "Tomada", help: "La psicóloga se está comunicando para acordar la hora.", className: "bg-blue-100 text-blue-800" },
  SCHEDULED: { text: "Programada", help: "Tiene fecha y hora.", className: "bg-violet-100 text-violet-800" },
  ATTENDED: { text: "Atendida", help: "La cita se realizó.", className: "bg-emerald-100 text-emerald-700" },
  REFERRED: { text: "Remitida", help: "Atendida y remitida a otra entidad.", className: "bg-pink-100 text-pink-800" },
  NO_SHOW: { text: "No asistió", help: "La persona no llegó a la cita.", className: "bg-orange-100 text-orange-700" },
  CANCELLED: { text: "Cancelada", help: "Se canceló.", className: "bg-slate-100 text-slate-500" },
};
/** Statuses in which the case is still open. */
export const OPEN_STATUSES: RequestStatus[] = ["PENDING_VERIFICATION", "PENDING", "TAKEN", "SCHEDULED"];

export const ORIGIN_NAME = { PUBLIC: "Enlace público", INTERNAL: "Registrada por el personal", FOLLOW_UP: "Seguimiento" } as const;

export const REQUESTER_TYPES = ["STUDENT", "TEACHER", "STAFF"] as const;
export const REQUESTER_TYPE_NAME: Record<(typeof REQUESTER_TYPES)[number], string> = { STUDENT: "Estudiante", TEACHER: "Docente", STAFF: "Administrativo" };

export const ATTENDANCES = ["ATTENDED", "NO_SHOW", "CANCELLED"] as const;
export const ATTENDANCE_NAME: Record<(typeof ATTENDANCES)[number], string> = { ATTENDED: "Asistió", NO_SHOW: "No asistió", CANCELLED: "Canceló a última hora" };

export const REFERRALS = ["NONE", "EPS", "CRISIS_LINE", "MEDICAL", "OTHER"] as const;
export const REFERRAL_NAME: Record<(typeof REFERRALS)[number], string> = { NONE: "Sin remisión", EPS: "EPS", CRISIS_LINE: "Línea de crisis", MEDICAL: "Medicina", OTHER: "Otra entidad" };

export const REASONS = ["ACADEMIC", "FAMILY", "EMOTIONAL", "SUBSTANCE_USE", "OTHER"] as const;
export const REASON_NAME: Record<(typeof REASONS)[number], string> = { ACADEMIC: "Académico", FAMILY: "Familiar", EMOTIONAL: "Emocional", SUBSTANCE_USE: "Consumo de sustancias", OTHER: "Otro" };

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Data left by whoever requests the appointment (through the public link or by the staff). */
export const requestSchema = z.object({
  requesterType: z.enum(REQUESTER_TYPES).default("STUDENT"),
  firstNames: z.string().trim().min(1, "Los nombres son obligatorios").max(80),
  lastNames: z.string().trim().min(1, "Los apellidos son obligatorios").max(80),
  documentType: z.enum(DOCUMENT_TYPES).default("CC"),
  document: z
    .string()
    .trim()
    .min(4, "El documento debe tener al menos 4 caracteres")
    .max(30)
    .regex(/^[A-Za-z0-9.\-\s]+$/, "El documento solo admite letras y números"),
  phone: z
    .string()
    .trim()
    .min(7, "Indique un teléfono de contacto")
    .max(30)
    .regex(/^[0-9+()\s-]+$/, "Teléfono inválido"),
  email: z.string().trim().toLowerCase().max(120).pipe(z.email("Correo inválido")),
  program: optional(120),
  campus: z.enum(CAMPUSES).optional().nullable(),
  preferredModality: z.enum(MODALITIES).optional().nullable(),
  availability: optional(300),
  reason: optional(1000),
  acceptsPolicy: z.literal(true, "Debe aceptar la política de tratamiento de datos"),
});
export type RequestInput = z.infer<typeof requestSchema>;

/** Schedule or reschedule the appointment (the psychologist, after talking with the person). */
export const scheduleSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    modality: z.enum(MODALITIES),
    campus: optional(40),
    location: optional(300),
    notify: z.boolean().default(true),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), { message: "La hora de fin debe ser posterior a la de inicio", path: ["endsAt"] })
  .refine((d) => new Date(d.endsAt).getTime() - new Date(d.startsAt).getTime() <= 4 * 3600000, { message: "Una consulta no puede durar más de 4 horas", path: ["endsAt"] });
export type ScheduleInput = z.infer<typeof scheduleSchema>;

/** Basic feedback on the appointment. */
export const feedbackSchema = z
  .object({
    attendance: z.enum(ATTENDANCES),
    referral: z.enum(REFERRALS).default("NONE"),
    reasonCategory: z.enum(REASONS).optional().nullable(),
    needsFollowUp: z.boolean().default(false),
    followUpDate: z.iso.date().optional().nullable(),
    // Missing = keep the stored note; empty string or null = delete it.
    observation: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => d.attendance !== "ATTENDED" || !!d.reasonCategory, { message: "Indique el motivo de consulta", path: ["reasonCategory"] });
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const cancelSchema = z.object({ reason: z.string().trim().min(3, "Indique el motivo").max(300) });

/** Status the request moves to according to the feedback. */
export function statusAfterFeedback(d: Pick<FeedbackInput, "attendance" | "referral">): RequestStatus {
  if (d.attendance === "NO_SHOW") return "NO_SHOW";
  if (d.attendance === "CANCELLED") return "CANCELLED";
  return d.referral !== "NONE" ? "REFERRED" : "ATTENDED";
}

/** Statuses of a request whose appointment actually took place. */
export const HELD_STATUSES: RequestStatus[] = ["ATTENDED", "REFERRED"];

/**
 * Does this request count towards the monthly limit of `now`'s month? An appointment only counts
 * when it actually took place (attended or referred) and its date falls in that calendar month.
 * Pending, unconfirmed, taken, scheduled, no-show and cancelled requests do not count.
 */
export function countsTowardLimit(r: { status: RequestStatus; appointmentAt: Date | null }, now = new Date()): boolean {
  if (!HELD_STATUSES.includes(r.status) || !r.appointmentAt) return false;
  return r.appointmentAt.getFullYear() === now.getFullYear() && r.appointmentAt.getMonth() === now.getMonth();
}
