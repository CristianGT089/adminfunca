/**
 * Monthly payroll: catalogs, requirements and validation. No server dependencies.
 *
 * A month's flow: OPEN (activities are recorded) → IN_REVIEW (academic coordination
 * reviews each person against the requirements) → APPROVED (amounts frozen, goes to payment) →
 * PAID (administrative coordination recorded every payment).
 */
import { z } from "zod";
import "@/lib/core/zodConfig";

export const PERIOD_STATUSES = ["OPEN", "IN_REVIEW", "APPROVED", "PAID"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];
export const PERIOD_STATUS: Record<PeriodStatus, { text: string; help: string }> = {
  OPEN: { text: "Registro de actividades", help: "Las horas se toman de la agenda a medida que se registran." },
  IN_REVIEW: { text: "En revisión", help: "Coordinación académica revisa los requisitos de cada persona." },
  APPROVED: { text: "Aprobada para pago", help: "Valores congelados. Coordinación administrativa registra los pagos." },
  PAID: { text: "Pagada", help: "Todos los pagos del mes están registrados." },
};

export const ITEM_STATUSES = ["PENDING", "FLAGGED", "VERIFIED", "PAID"] as const;
export type PayrollItemStatusValue = (typeof ITEM_STATUSES)[number];
export const PAYROLL_ITEM_STATUS: Record<PayrollItemStatusValue, { text: string; className: string }> = {
  PENDING: { text: "Por revisar", className: "bg-slate-100 text-slate-600" },
  FLAGGED: { text: "Con observación", className: "bg-red-100 text-red-700" },
  VERIFIED: { text: "Verificado", className: "bg-emerald-100 text-emerald-700" },
  PAID: { text: "Pagado", className: "bg-blue-100 text-blue-800" },
};

/** Requirements checked by hand for each person before verifying them. */
export const REQUIREMENTS = [
  { key: "hoursReviewed", text: "Horas revisadas contra la agenda" },
  { key: "confirmation", text: "La persona confirmó sus horas" },
  { key: "invoice", text: "Cuenta de cobro o soporte recibido" },
  { key: "socialSecurity", text: "Planilla de seguridad social verificada" },
] as const;
export type RequirementKey = (typeof REQUIREMENTS)[number]["key"];
export const REQUIREMENT_KEYS = REQUIREMENTS.map((r) => r.key) as [RequirementKey, ...RequirementKey[]];

/** Summary of a person's activities in the month (what `PayrollItem.calculation` stores). */
export type Calculation = {
  hoursByType: Record<string, number>;
  amountByType: Record<string, number>;
  events: number;
  hours: number;
  amount: number;
  withoutRate: number; // entries without an hourly rate (neither their own nor the person's base rate)
  withoutClosing: number; // field trips and consultations already past without a closing
};

/** Automatic requirements (derived from the calculation) plus the manual ones. */
export function requirementsMet(calculation: Pick<Calculation, "withoutRate" | "withoutClosing">, manual: Partial<Record<RequirementKey, boolean>>) {
  const list = [
    { key: "rates", text: "Todas las actividades tienen valor por hora", ok: calculation.withoutRate === 0, auto: true },
    { key: "closings", text: "Prácticas y consultas con cierre registrado", ok: calculation.withoutClosing === 0, auto: true },
    ...REQUIREMENTS.map((r) => ({ key: r.key, text: r.text, ok: !!manual[r.key], auto: false })),
  ];
  return { list, met: list.filter((r) => r.ok).length, total: list.length, complete: list.every((r) => r.ok) };
}

export const periodActionSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  action: z.enum(["review", "reopen", "approve", "unapprove"]),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type PeriodAction = z.infer<typeof periodActionSchema>["action"];

export const itemActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("requirements"), requirements: z.partialRecord(z.enum(REQUIREMENT_KEYS), z.boolean()) }),
  z.object({ action: z.literal("verify") }),
  z.object({ action: z.literal("flag"), observation: z.string().trim().min(3, "Escriba la observación").max(1000) }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("pay"), date: z.iso.date(), reference: z.string().trim().max(120).optional().nullable() }),
]);
export type ItemAction = z.infer<typeof itemActionSchema>;

export const payAllSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  date: z.iso.date(),
  reference: z.string().trim().max(120).optional().nullable(),
});

export const rateSchema = z.object({
  personId: z.string().min(1),
  hourlyRate: z.number().int().min(0).max(5_000_000).nullable(),
});

/** `?year=2026&month=10` from the URL, or null if it is not valid. */
export function readMonth(req: Request) {
  const p = new URL(req.url).searchParams;
  const year = Number(p.get("year"));
  const month = Number(p.get("month"));
  return Number.isInteger(year) && year > 2000 && Number.isInteger(month) && month >= 1 && month <= 12 ? { year, month } : null;
}
