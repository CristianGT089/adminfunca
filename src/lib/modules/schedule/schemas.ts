import { z } from "zod";
import { SHIFTS } from "./shifts";

export const EVENT_TYPES = ["MODULE_CLASS", "COURSE", "DIPLOMA", "FIELD_TRIP", "PSYCHOLOGY_SESSION", "OTHER"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_NAME: Record<EventType, string> = {
  MODULE_CLASS: "Clase de módulo",
  COURSE: "Curso",
  DIPLOMA: "Diplomado",
  FIELD_TRIP: "Práctica / salida",
  PSYCHOLOGY_SESSION: "Consulta de psicología",
  OTHER: "Otro",
};

/** Colors per type (Tailwind classes) for the calendar and labels. */
export const EVENT_TYPE_COLOR: Record<EventType, { bg: string; text: string; border: string; dot: string }> = {
  MODULE_CLASS: { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-400", dot: "bg-blue-600" },
  COURSE: { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-400", dot: "bg-emerald-600" },
  DIPLOMA: { bg: "bg-violet-100", text: "text-violet-900", border: "border-violet-400", dot: "bg-violet-600" },
  FIELD_TRIP: { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-400", dot: "bg-orange-600" },
  PSYCHOLOGY_SESSION: { bg: "bg-pink-100", text: "text-pink-900", border: "border-pink-400", dot: "bg-pink-600" },
  OTHER: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-400", dot: "bg-slate-500" },
};

export const MODALITIES = ["IN_PERSON", "VIRTUAL"] as const;
export type Modality = (typeof MODALITIES)[number];
export const MODALITY_NAME: Record<Modality, string> = { IN_PERSON: "Presencial", VIRTUAL: "Virtual" };

export const COMPLETIONS = ["COMPLETED", "NOT_COMPLETED", "CANCELLED"] as const;
export type Completion = (typeof COMPLETIONS)[number];
export const COMPLETION_NAME: Record<Completion, { text: string; help: string; className: string }> = {
  COMPLETED: { text: "Realizada", help: "La actividad se hizo.", className: "bg-emerald-100 text-emerald-700" },
  NOT_COMPLETED: { text: "No se realizó", help: "Se reservó el tiempo pero no se dio (cuenta para la nómina).", className: "bg-gold-100 text-gold-700" },
  CANCELLED: { text: "Cancelada", help: "Se canceló con anticipación; no cuenta para la nómina.", className: "bg-slate-100 text-slate-500" },
};

/** Types that need closing (completed / not completed) to pass the payroll review. */
export const TYPES_REQUIRING_CLOSING: EventType[] = ["FIELD_TRIP", "PSYCHOLOGY_SESSION"];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const WEEKDAYS = [
  { value: 1, short: "L", name: "Lunes" },
  { value: 2, short: "M", name: "Martes" },
  { value: 3, short: "X", name: "Miércoles" },
  { value: 4, short: "J", name: "Jueves" },
  { value: 5, short: "V", name: "Viernes" },
  { value: 6, short: "S", name: "Sábado" },
  { value: 0, short: "D", name: "Domingo" },
] as const;

export const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPES).default("MODULE_CLASS"),
    shift: z.enum(SHIFTS).optional().nullable(),
    title: z.string().trim().min(2, "El título es obligatorio").max(140),
    description: optionalText(1000),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    // If missing, it is computed from start and end.
    hours: z.coerce.number().min(0).max(24).optional().nullable(),
    modality: z.enum(MODALITIES).default("IN_PERSON"),
    campus: optionalText(40),
    location: optionalText(300),
    // Hourly rate in pesos. Required for courses (each teacher is paid according to their profile).
    hourlyRate: z.coerce.number().int().min(0).max(5_000_000).optional().nullable(),
    studentCount: z.coerce.number().int().min(0).max(500).optional().nullable(),
    payable: z.boolean().default(true),
    teacherId: optionalText(40),
    moduleId: optionalText(40),
    // Weekly repetition (only on create): days of the week and end date (inclusive).
    repeat: z
      .object({
        days: z.array(z.number().int().min(0).max(6)).min(1),
        until: z.iso.date(),
      })
      .optional()
      .nullable(),
    // Alternative to `repeat` for module classes: standard shift between two dates.
    // Hours and days come from the shift; `startsAt`/`endsAt` are ignored except for the start date.
    byShift: z
      .object({
        shift: z.enum(SHIFTS),
        from: z.iso.date(),
        until: z.iso.date(),
      })
      .optional()
      .nullable(),
  })
  .refine((e) => new Date(e.endsAt) > new Date(e.startsAt), { message: "La hora de fin debe ser posterior a la de inicio", path: ["endsAt"] })
  .refine((e) => e.type !== "COURSE" || (e.hourlyRate ?? 0) > 0, { message: "En los cursos indique el valor de la hora para este docente", path: ["hourlyRate"] });
export type EventInput = z.infer<typeof eventSchema>;

/** For editing: same fields without repetition; `scope` decides whether only this session or the whole series changes. */
export const eventEditSchema = eventSchema.safeExtend({ repeat: z.null().optional(), byShift: z.null().optional(), scope: z.enum(["one", "series"]).default("one") });
export type EventEditInput = z.infer<typeof eventEditSchema>;

export const rangeSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  teacherId: z.string().optional(),
  type: z.enum(EVENT_TYPES).optional(),
});

/** Closing of an activity that has already started. */
export const closingSchema = z.object({
  completion: z.enum(COMPLETIONS),
  note: optionalText(500),
});
export type ClosingInput = z.infer<typeof closingSchema>;
