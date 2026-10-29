/**
 * Monthly payroll. Hours come from the schedule.
 *
 * Reading never writes: `getPayroll` / `itemDetail` compute the month in memory from the
 * schedule, on top of what is stored. A month without a `PayrollPeriod` row is OPEN, and a person
 * without a `PayrollItem` row is PENDING with no requirements checked.
 *
 * Rows are only written by the actions (inside one transaction that locks the period row):
 * - an item action (requirements, verify, flag, reopen) upserts that person's row with the
 *   calculation of that moment; on verify that calculation is frozen (VERIFIED and PAID rows are
 *   shown as stored, not recalculated);
 * - a period transition creates the period row if needed; approve requires every person to be
 *   verified (i.e. frozen) and removes the leftover rows of people who no longer have activities;
 * - once the month is approved only the stored rows count, and that month's schedule can no
 *   longer be changed (`ensureMonthEditable`, which waits for this lock).
 */
import type { PayrollItem, PayrollPeriod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { BusinessError } from "@/lib/core/http";
import { eventInclude, toPublicEvent, type Db } from "@/lib/modules/schedule/service";
import type { EventType } from "@/lib/modules/schedule/schemas";
import { calculate, countsForPayroll, effectiveRate } from "./calculation";
import { requirementsMet, type ItemAction, type Calculation, type RequirementKey, type PayrollItemStatusValue, type PeriodStatus, type PeriodAction } from "./schemas";

const monthRange = (year: number, month: number) => ({ gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) });

const personSelect = { id: true, firstNames: true, lastNames: true, documentLast4: true, type: true, hourlyRate: true, user: { select: { role: true } } } as const;
type PersonInfo = Prisma.PersonGetPayload<{ select: typeof personSelect }>;
const itemInclude = { person: { select: personSelect } } as const;
type StoredItem = PayrollItem & { person: PersonInfo };

/** A person's line in the month: the stored row (if any) plus the calculation that applies. */
type MonthItem = { person: PersonInfo; stored: StoredItem | null; calculation: Calculation; hours: number; amount: number };

/** A verified or paid person keeps the calculation stored when they were verified. */
const isFixed = (status: string) => status === "VERIFIED" || status === "PAID";
/** In an approved or paid month only the stored rows count. */
const isFrozen = (status: string) => status === "APPROVED" || status === "PAID";
const notFound = () => new BusinessError("Registro de nómina no encontrado", 404);

/** Calculation from the schedule of the people with activities in the month (or of one person). */
async function freshCalculations(db: Db, year: number, month: number, filter: { personId?: string; exclude?: string[] } = {}) {
  const exclude = filter.exclude ?? [];
  const result = new Map<string, { person: PersonInfo; calculation: Calculation }>();
  if (filter.personId && exclude.includes(filter.personId)) return result;
  const events = await db.event.findMany({
    where: { startsAt: monthRange(year, month), teacherId: filter.personId ?? { not: null, ...(exclude.length ? { notIn: exclude } : {}) } },
    select: { type: true, hours: true, hourlyRate: true, payable: true, completion: true, startsAt: true, teacherId: true, teacher: { select: personSelect } },
  });
  const byPerson = new Map<string, { person: PersonInfo; events: typeof events }>();
  for (const e of events) {
    if (!e.teacher) continue;
    const p = byPerson.get(e.teacher.id) ?? { person: e.teacher, events: [] };
    p.events.push(e);
    byPerson.set(e.teacher.id, p);
  }
  for (const [personId, p] of byPerson) {
    const calculation = calculate(
      p.events.map((e) => ({ ...e, type: e.type as EventType })),
      p.person.hourlyRate
    );
    if (calculation.events === 0 && calculation.withoutClosing === 0) continue;
    result.set(personId, { person: p.person, calculation });
  }
  return result;
}

/** The month as it is now (read only). `personId` limits it to one person. */
async function loadMonth(db: Db, year: number, month: number, personId?: string) {
  const period = await db.payrollPeriod.findUnique({ where: { year_month: { year, month } } });
  const stored: StoredItem[] = period ? await db.payrollItem.findMany({ where: { periodId: period.id, ...(personId ? { personId } : {}) }, include: itemInclude }) : [];
  const frozen = !!period && isFrozen(period.status);
  const fixed = stored.filter((i) => frozen || isFixed(i.status));
  const items: MonthItem[] = fixed.map((i) => ({ person: i.person, stored: i, calculation: i.calculation as unknown as Calculation, hours: i.hours, amount: i.amount }));
  if (!frozen) {
    const byPerson = new Map(stored.map((i) => [i.personId, i]));
    const fresh = await freshCalculations(db, year, month, { personId, exclude: fixed.map((i) => i.personId) });
    for (const [id, f] of fresh) items.push({ person: f.person, stored: byPerson.get(id) ?? null, calculation: f.calculation, hours: f.calculation.hours, amount: f.calculation.amount });
  }
  return { period, stored, items };
}

/**
 * Creates the period row if needed and locks it until the end of the transaction: item actions,
 * period transitions and schedule writes of that month (`ensureMonthEditable`) run one at a time.
 */
async function lockPeriod(tx: Prisma.TransactionClient, year: number, month: number): Promise<PayrollPeriod> {
  const p = await tx.payrollPeriod.upsert({ where: { year_month: { year, month } }, update: {}, create: { year, month } });
  await tx.$queryRaw`SELECT id FROM payroll_periods WHERE id = ${p.id} FOR UPDATE`;
  return tx.payrollPeriod.findUniqueOrThrow({ where: { id: p.id } });
}

/**
 * @returns the public line of a person. Its `id` is the person's id: a person may not have a
 *   stored row yet, and the endpoints address a line by month + person.
 */
function toPublicPayrollItem(m: MonthItem) {
  const s = m.stored;
  const requirements = (s?.requirements ?? {}) as Partial<Record<RequirementKey, boolean>>;
  return {
    id: m.person.id,
    status: (s?.status ?? "PENDING") as PayrollItemStatusValue,
    person: {
      id: m.person.id,
      fullName: `${m.person.firstNames} ${m.person.lastNames}`,
      lastNames: m.person.lastNames,
      documentLast4: m.person.documentLast4,
      profile: m.person.user?.role ?? m.person.type,
      baseHourlyRate: m.person.hourlyRate,
    },
    calculation: m.calculation,
    hours: m.hours,
    amount: m.amount,
    requirements,
    review: requirementsMet(m.calculation, requirements),
    observation: s?.observation ?? null,
    verifiedAt: s?.verifiedAt?.toISOString() ?? null,
    paidAt: s?.paidAt?.toISOString() ?? null,
    paymentReference: s?.paymentReference ?? null,
  };
}
export type PublicPayrollItem = ReturnType<typeof toPublicPayrollItem>;

export async function getPayroll(year: number, month: number) {
  const { period, items: lines } = await loadMonth(prisma, year, month);
  const items = lines.map(toPublicPayrollItem).sort((a, b) => a.person.lastNames.localeCompare(b.person.lastNames));

  const hoursByType: Record<string, number> = {};
  const amountByType: Record<string, number> = {};
  for (const i of items) {
    for (const [t, h] of Object.entries(i.calculation.hoursByType)) hoursByType[t] = Math.round(((hoursByType[t] ?? 0) + h) * 100) / 100;
    for (const [t, v] of Object.entries(i.calculation.amountByType ?? {})) amountByType[t] = (amountByType[t] ?? 0) + v;
  }
  const byStatus = Object.fromEntries((["PENDING", "FLAGGED", "VERIFIED", "PAID"] as PayrollItemStatusValue[]).map((s) => [s, items.filter((i) => i.status === s).length])) as Record<PayrollItemStatusValue, number>;
  return {
    period: {
      // null while nobody has acted on the month (no row yet).
      id: period?.id ?? null,
      year,
      month,
      status: (period?.status ?? "OPEN") as PeriodStatus,
      notes: period?.notes ?? null,
      inReviewAt: period?.inReviewAt?.toISOString() ?? null,
      approvedAt: period?.approvedAt?.toISOString() ?? null,
      paidAt: period?.paidAt?.toISOString() ?? null,
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

/** A person's detail in the month: their entries with the rate that applies to each one. */
export async function itemDetail(year: number, month: number, personId: string) {
  const { items } = await loadMonth(prisma, year, month, personId);
  const line = items[0];
  if (!line) throw notFound();
  const events = await prisma.event.findMany({ where: { teacherId: personId, startsAt: monthRange(year, month) }, orderBy: { startsAt: "asc" }, include: eventInclude });
  const base = line.person.hourlyRate;
  const current = calculate(
    events.map((e) => ({ ...e, type: e.type as EventType })),
    base
  );
  const item = toPublicPayrollItem(line);
  return {
    item,
    events: events.map((e) => {
      const rate = effectiveRate(e, base);
      return { ...toPublicEvent(e), counts: countsForPayroll(e), appliedRate: rate, subtotal: countsForPayroll(e) && rate != null ? Math.round(e.hours * rate) : 0 };
    }),
    // If the person was already verified and the schedule changed afterwards, warn about it.
    changedSinceVerification: isFixed(item.status) && (current.hours !== item.hours || current.amount !== item.amount),
  };
}

const calculationData = (c: Calculation) => ({ calculation: c as unknown as Prisma.InputJsonValue, hours: c.hours, amount: c.amount });

/**
 * Review or payment of a person in the month. The period status, the person's row and the
 * schedule are read and written in one transaction holding the period lock, so an approval (or
 * another action) cannot slip in between the check and the write.
 */
export async function itemAction(year: number, month: number, personId: string, action: ItemAction, userId: string) {
  return prisma.$transaction(async (tx) => {
    const period = await lockPeriod(tx, year, month);
    const periodStatus = period.status as PeriodStatus;
    const inReview = periodStatus === "OPEN" || periodStatus === "IN_REVIEW";
    const where = { periodId_personId: { periodId: period.id, personId } };
    const stored = await tx.payrollItem.findUnique({ where });
    const status = (stored?.status ?? "PENDING") as PayrollItemStatusValue;
    const fresh = inReview ? ((await freshCalculations(tx, year, month, { personId })).get(personId)?.calculation ?? null) : null;
    // Someone without a row is only in the month while they have activities; a non-verified row
    // of someone who no longer has them is not shown either.
    if (!stored ? !fresh : !isFixed(status) && !isFrozen(periodStatus) && !fresh) throw notFound();
    const calculation = fresh ?? (stored!.calculation as unknown as Calculation);
    const requirements = (stored?.requirements ?? {}) as Partial<Record<RequirementKey, boolean>>;

    let data: { status?: PayrollItemStatusValue; requirements?: Prisma.InputJsonValue; observation?: string | null; verifiedAt?: Date | null; verifiedById?: string | null };
    switch (action.action) {
      case "requirements":
        if (!inReview || isFixed(status)) throw new BusinessError("Reabra la revisión de esta persona para cambiar sus requisitos");
        data = { requirements: { ...requirements, ...action.requirements } };
        break;
      case "verify": {
        if (!inReview) throw new BusinessError("El mes ya está aprobado");
        const r = requirementsMet(calculation, requirements);
        if (!r.complete) throw new BusinessError(`Faltan requisitos: ${r.list.filter((x) => !x.ok).map((x) => x.text.toLowerCase()).join("; ")}`);
        // From here on this calculation is the one that is paid.
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
      case "pay": {
        if (periodStatus !== "APPROVED") throw new BusinessError("Solo se registran pagos de un mes aprobado");
        if (!stored || status !== "VERIFIED") throw new BusinessError("Esta persona no está verificada");
        const paid = await tx.payrollItem.update({ where, data: { status: "PAID", paidAt: new Date(`${action.date}T12:00:00`), paymentReference: action.reference ?? null } });
        await closeIfAllPaid(tx, period.id);
        return paid;
      }
    }
    // In review the row always takes the calculation of this moment (frozen on verify).
    return tx.payrollItem.upsert({ where, update: { ...data, ...calculationData(calculation) }, create: { ...data, ...calculationData(calculation), periodId: period.id, personId } });
  });
}

async function closeIfAllPaid(tx: Prisma.TransactionClient, periodId: string) {
  const remaining = await tx.payrollItem.count({ where: { periodId, status: { not: "PAID" } } });
  if (remaining === 0) await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "PAID", paidAt: new Date() } });
}

/** Rows of people who are no longer in the month (no activities and not verified). */
async function removeLeftovers(tx: Prisma.TransactionClient, stored: StoredItem[], items: MonthItem[]) {
  const shown = new Set(items.map((i) => i.person.id));
  const leftover = stored.filter((i) => !shown.has(i.personId)).map((i) => i.id);
  if (leftover.length) await tx.payrollItem.deleteMany({ where: { id: { in: leftover } } });
}

export async function periodAction(year: number, month: number, action: PeriodAction, userId: string, notes?: string | null) {
  return prisma.$transaction(async (tx) => {
    const period = await lockPeriod(tx, year, month);
    const status = period.status as PeriodStatus;
    const extra = notes !== undefined ? { notes } : {};
    switch (action) {
      case "review": {
        if (status !== "OPEN") throw new BusinessError("El mes ya está en revisión o aprobado");
        const { stored, items } = await loadMonth(tx, year, month);
        await removeLeftovers(tx, stored, items);
        return tx.payrollPeriod.update({ where: { id: period.id }, data: { status: "IN_REVIEW", inReviewAt: new Date(), ...extra } });
      }
      case "reopen":
        if (status !== "IN_REVIEW") throw new BusinessError("Solo se reabre un mes en revisión");
        return tx.payrollPeriod.update({ where: { id: period.id }, data: { status: "OPEN", ...extra } });
      case "approve": {
        if (status !== "IN_REVIEW") throw new BusinessError("Primero pase el mes a revisión");
        const { stored, items } = await loadMonth(tx, year, month);
        if (items.length === 0) throw new BusinessError("El mes no tiene personas para pagar");
        const remaining = items.filter((i) => i.stored?.status !== "VERIFIED").length;
        if (remaining > 0) throw new BusinessError(`Faltan ${remaining} persona${remaining === 1 ? "" : "s"} por verificar`);
        // Everyone is verified, so every row already holds its frozen calculation; what is left
        // over (people without activities any more) goes away with the approval.
        await removeLeftovers(tx, stored, items);
        return tx.payrollPeriod.update({ where: { id: period.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: userId, ...extra } });
      }
      case "unapprove": {
        if (status !== "APPROVED") throw new BusinessError("El mes no está aprobado");
        if (await tx.payrollItem.count({ where: { periodId: period.id, status: "PAID" } })) throw new BusinessError("Ya hay pagos registrados en este mes; no se puede devolver a revisión", 409);
        return tx.payrollPeriod.update({ where: { id: period.id }, data: { status: "IN_REVIEW", approvedAt: null, approvedById: null, ...extra } });
      }
    }
  });
}

export async function payAll(year: number, month: number, date: string, reference: string | null) {
  return prisma.$transaction(async (tx) => {
    const period = await lockPeriod(tx, year, month);
    if (period.status !== "APPROVED") throw new BusinessError("Solo se registran pagos de un mes aprobado");
    const r = await tx.payrollItem.updateMany({ where: { periodId: period.id, status: "VERIFIED" }, data: { status: "PAID", paidAt: new Date(`${date}T12:00:00`), paymentReference: reference } });
    await closeIfAllPaid(tx, period.id);
    return r.count;
  });
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
