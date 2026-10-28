/**
 * Monthly payroll. Hours come from the schedule: while the month is not approved, every query
 * recalculates the people who are not verified yet. Once a person is verified their calculation
 * is fixed; once the month is approved, that month's schedule can no longer be changed.
 */
import type { PayrollItem, PayrollPeriod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { BusinessError } from "@/lib/core/http";
import { eventInclude, toPublicEvent } from "@/lib/modules/schedule/service";
import type { EventType } from "@/lib/modules/schedule/schemas";
import { calculate, countsForPayroll, effectiveRate } from "./calculation";
import { requirementsMet, type ItemAction, type Calculation, type RequirementKey, type PayrollItemStatusValue, type PeriodStatus, type PeriodAction } from "./schemas";

const monthRange = (year: number, month: number) => ({ gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) });

async function periodOf(year: number, month: number) {
  return prisma.payrollPeriod.upsert({ where: { year_month: { year, month } }, update: {}, create: { year, month } });
}

/** Recalculates, from the schedule, the people of the month who are not verified or paid yet. */
async function sync(period: PayrollPeriod) {
  if (period.status === "APPROVED" || period.status === "PAID") return;
  const events = await prisma.event.findMany({
    where: { startsAt: monthRange(period.year, period.month), teacherId: { not: null } },
    select: { type: true, hours: true, hourlyRate: true, payable: true, completion: true, startsAt: true, teacherId: true, teacher: { select: { hourlyRate: true } } },
  });
  const byPerson = new Map<string, { base: number | null; events: typeof events }>();
  for (const e of events) {
    const p = byPerson.get(e.teacherId!) ?? { base: e.teacher?.hourlyRate ?? null, events: [] };
    p.events.push(e);
    byPerson.set(e.teacherId!, p);
  }
  const current = await prisma.payrollItem.findMany({ where: { periodId: period.id } });
  const fixed = new Set(current.filter((i) => i.status === "VERIFIED" || i.status === "PAID").map((i) => i.personId));

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  for (const [personId, p] of byPerson) {
    if (fixed.has(personId)) continue;
    const calculation = calculate(p.events.map((e) => ({ ...e, type: e.type as EventType })), p.base);
    if (calculation.events === 0 && calculation.withoutClosing === 0) continue;
    const data = { calculation: calculation as unknown as Prisma.InputJsonValue, hours: calculation.hours, amount: calculation.amount };
    operations.push(prisma.payrollItem.upsert({ where: { periodId_personId: { periodId: period.id, personId } }, update: data, create: { ...data, periodId: period.id, personId } }));
  }
  // Whoever no longer has activities in the month leaves the list (if they had not been verified).
  const leftover = current.filter((i) => !fixed.has(i.personId) && !byPerson.has(i.personId)).map((i) => i.id);
  if (leftover.length) operations.push(prisma.payrollItem.deleteMany({ where: { id: { in: leftover } } }));
  if (operations.length) await prisma.$transaction(operations);
}

type ItemDb = PayrollItem & { person: { id: string; firstNames: string; lastNames: string; documentLast4: string; type: string; hourlyRate: number | null; user: { role: string } | null } };

function toPublicPayrollItem(i: ItemDb) {
  const calculation = i.calculation as unknown as Calculation;
  const requirements = (i.requirements ?? {}) as Partial<Record<RequirementKey, boolean>>;
  return {
    id: i.id,
    status: i.status as PayrollItemStatusValue,
    person: {
      id: i.person.id,
      fullName: `${i.person.firstNames} ${i.person.lastNames}`,
      lastNames: i.person.lastNames,
      documentLast4: i.person.documentLast4,
      profile: i.person.user?.role ?? i.person.type,
      baseHourlyRate: i.person.hourlyRate,
    },
    calculation,
    hours: i.hours,
    amount: i.amount,
    requirements,
    review: requirementsMet(calculation, requirements),
    observation: i.observation,
    verifiedAt: i.verifiedAt?.toISOString() ?? null,
    paidAt: i.paidAt?.toISOString() ?? null,
    paymentReference: i.paymentReference,
  };
}
export type PublicPayrollItem = ReturnType<typeof toPublicPayrollItem>;

const itemInclude = { person: { select: { id: true, firstNames: true, lastNames: true, documentLast4: true, type: true, hourlyRate: true, user: { select: { role: true } } } } } as const;

export async function getPayroll(year: number, month: number) {
  let period = await periodOf(year, month);
  await sync(period);
  period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period.id } });
  const items = (await prisma.payrollItem.findMany({ where: { periodId: period.id }, include: itemInclude })).map(toPublicPayrollItem).sort((a, b) => a.person.lastNames.localeCompare(b.person.lastNames));

  const hoursByType: Record<string, number> = {};
  const amountByType: Record<string, number> = {};
  for (const i of items) {
    for (const [t, h] of Object.entries(i.calculation.hoursByType)) hoursByType[t] = Math.round(((hoursByType[t] ?? 0) + h) * 100) / 100;
    for (const [t, v] of Object.entries(i.calculation.amountByType ?? {})) amountByType[t] = (amountByType[t] ?? 0) + v;
  }
  const byStatus = Object.fromEntries((["PENDING", "FLAGGED", "VERIFIED", "PAID"] as PayrollItemStatusValue[]).map((s) => [s, items.filter((i) => i.status === s).length])) as Record<PayrollItemStatusValue, number>;
  return {
    period: {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status as PeriodStatus,
      notes: period.notes,
      inReviewAt: period.inReviewAt?.toISOString() ?? null,
      approvedAt: period.approvedAt?.toISOString() ?? null,
      paidAt: period.paidAt?.toISOString() ?? null,
      monthEnded: new Date() >= new Date(year, month, 1),
    },
    items,
    totals: {
      people: items.length,
      hours: Math.round(items.reduce((s, i) => s + i.hours, 0) * 100) / 100,
      amount: items.reduce((s, i) => s + i.amount, 0),
      paid: items.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0),
      hoursByType,
      amountByType,
      byStatus,
      pendingRequirements: items.filter((i) => !i.review.complete).length,
    },
  };
}
export type Payroll = Awaited<ReturnType<typeof getPayroll>>;

/** A person's detail: their entries of the month with the rate that applies to each one. */
export async function itemDetail(id: string) {
  const item = await prisma.payrollItem.findUnique({ where: { id }, include: { ...itemInclude, period: true } });
  if (!item) throw new BusinessError("Registro de nómina no encontrado", 404);
  const events = await prisma.event.findMany({ where: { teacherId: item.personId, startsAt: monthRange(item.period.year, item.period.month) }, orderBy: { startsAt: "asc" }, include: eventInclude });
  const base = item.person.hourlyRate;
  const current = calculate(events.map((e) => ({ ...e, type: e.type as EventType })), base);
  return {
    item: toPublicPayrollItem(item),
    events: events.map((e) => {
      const rate = effectiveRate(e, base);
      return { ...toPublicEvent(e), counts: countsForPayroll(e), appliedRate: rate, subtotal: countsForPayroll(e) && rate != null ? Math.round(e.hours * rate) : 0 };
    }),
    // If the person was already verified and the schedule changed afterwards, warn about it.
    changedSinceVerification: (item.status === "VERIFIED" || item.status === "PAID") && (current.hours !== item.hours || current.amount !== item.amount),
  };
}

export async function itemAction(id: string, action: ItemAction, userId: string) {
  const item = await prisma.payrollItem.findUnique({ where: { id }, include: { ...itemInclude, period: true } });
  if (!item) throw new BusinessError("Registro de nómina no encontrado", 404);
  const periodStatus = item.period.status as PeriodStatus;
  const inReview = periodStatus === "OPEN" || periodStatus === "IN_REVIEW";
  let data: Prisma.PayrollItemUpdateInput;

  switch (action.action) {
    case "requirements":
      if (!inReview || item.status === "VERIFIED" || item.status === "PAID") throw new BusinessError("Reabra la revisión de esta persona para cambiar sus requisitos");
      data = { requirements: { ...((item.requirements ?? {}) as object), ...action.requirements } };
      break;
    case "verify": {
      if (!inReview) throw new BusinessError("El mes ya está aprobado");
      const r = requirementsMet(item.calculation as unknown as Calculation, (item.requirements ?? {}) as Partial<Record<RequirementKey, boolean>>);
      if (!r.complete) throw new BusinessError(`Faltan requisitos: ${r.list.filter((x) => !x.ok).map((x) => x.text.toLowerCase()).join("; ")}`);
      data = { status: "VERIFIED", verifiedAt: new Date(), verifiedById: userId, observation: null };
      break;
    }
    case "flag":
      if (!inReview) throw new BusinessError("El mes ya está aprobado");
      data = { status: "FLAGGED", observation: action.observation, verifiedAt: null };
      break;
    case "reopen":
      if (!inReview) throw new BusinessError("El mes ya está aprobado; primero devuélvalo a revisión");
      data = { status: "PENDING", verifiedAt: null, verifiedById: null };
      break;
    case "pay":
      if (periodStatus !== "APPROVED") throw new BusinessError("Solo se registran pagos de un mes aprobado");
      if (item.status !== "VERIFIED") throw new BusinessError("Esta persona no está verificada");
      data = { status: "PAID", paidAt: new Date(`${action.date}T12:00:00`), paymentReference: action.reference ?? null };
      break;
  }
  await prisma.payrollItem.update({ where: { id }, data });
  if (action.action === "pay") await closeIfAllPaid(item.periodId);
  // On reopen, the calculation is updated from the schedule on the next query.
  return item.period;
}

async function closeIfAllPaid(periodId: string) {
  const remaining = await prisma.payrollItem.count({ where: { periodId, status: { not: "PAID" } } });
  if (remaining === 0) await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "PAID", paidAt: new Date() } });
}

export async function periodAction(year: number, month: number, action: PeriodAction, userId: string, notes?: string | null) {
  const period = await periodOf(year, month);
  const status = period.status as PeriodStatus;
  const extra = notes !== undefined ? { notes } : {};
  switch (action) {
    case "review":
      if (status !== "OPEN") throw new BusinessError("El mes ya está en revisión o aprobado");
      await sync(period);
      return prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "IN_REVIEW", inReviewAt: new Date(), ...extra } });
    case "reopen":
      if (status !== "IN_REVIEW") throw new BusinessError("Solo se reabre un mes en revisión");
      return prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "OPEN", ...extra } });
    case "approve": {
      if (status !== "IN_REVIEW") throw new BusinessError("Primero pase el mes a revisión");
      await sync(period);
      const items = await prisma.payrollItem.findMany({ where: { periodId: period.id }, select: { status: true } });
      if (items.length === 0) throw new BusinessError("El mes no tiene personas para pagar");
      const remaining = items.filter((i) => i.status !== "VERIFIED").length;
      if (remaining > 0) throw new BusinessError(`Faltan ${remaining} persona${remaining === 1 ? "" : "s"} por verificar`);
      return prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: userId, ...extra } });
    }
    case "unapprove": {
      if (status !== "APPROVED") throw new BusinessError("El mes no está aprobado");
      if (await prisma.payrollItem.count({ where: { periodId: period.id, status: "PAID" } })) throw new BusinessError("Ya hay pagos registrados en este mes; no se puede devolver a revisión", 409);
      return prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: "IN_REVIEW", approvedAt: null, approvedById: null, ...extra } });
    }
  }
}

export async function payAll(year: number, month: number, date: string, reference: string | null) {
  const period = await periodOf(year, month);
  if (period.status !== "APPROVED") throw new BusinessError("Solo se registran pagos de un mes aprobado");
  const r = await prisma.payrollItem.updateMany({ where: { periodId: period.id, status: "VERIFIED" }, data: { status: "PAID", paidAt: new Date(`${date}T12:00:00`), paymentReference: reference } });
  await closeIfAllPaid(period.id);
  return r.count;
}

/** A person's base hourly rate (used in the entries that don't carry their own). */
export async function setRate(personId: string, hourlyRate: number | null) {
  const p = await prisma.person.findUnique({ where: { id: personId } });
  if (!p) throw new BusinessError("Persona no encontrada", 404);
  return prisma.person.update({ where: { id: personId }, data: { hourlyRate } });
}

/** Month report as CSV (";" separator so that Excel in Spanish opens it in columns). */
export async function csvReport(year: number, month: number, typeNames: Record<string, string>) {
  const { items, period } = await getPayroll(year, month);
  const types = Object.keys(typeNames);
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // Text starting with = + - @ would run as a formula in Excel (CSV injection): neutralize it.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Persona", "Documento", ...types.map((t) => `Horas ${typeNames[t]}`), "Total horas", "Valor", "Estado", "Fecha de pago", "Referencia"],
    ...items.map((i) => [
      i.person.fullName,
      `••••${i.person.documentLast4}`,
      ...types.map((t) => i.calculation.hoursByType[t] ?? 0),
      i.hours,
      i.amount,
      i.status,
      i.paidAt?.slice(0, 10) ?? "",
      i.paymentReference ?? "",
    ]),
  ];
  return { csv: "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n"), period };
}
