/** Pure calculation of a person's hours and amounts in the month (tested in tests/payroll.test.ts). */
import { TYPES_REQUIRING_CLOSING, type EventType } from "@/lib/modules/schedule/schemas";
import type { Calculation } from "./schemas";

export type PayrollEvent = { type: EventType; hours: number; hourlyRate: number | null; payable: boolean; completion: string | null; startsAt: Date };

/** Does the entry count for payroll? Non-payable and cancelled ones don't. */
export const countsForPayroll = (e: Pick<PayrollEvent, "payable" | "completion">) => e.payable && e.completion !== "CANCELLED";

/** Applicable hourly rate: the entry's own or, if it has none, the person's base rate. */
export const effectiveRate = (e: Pick<PayrollEvent, "hourlyRate">, baseRate: number | null) => e.hourlyRate ?? baseRate;

export function calculate(events: PayrollEvent[], baseRate: number | null, now = new Date()): Calculation {
  const c: Calculation = { hoursByType: {}, amountByType: {}, events: 0, hours: 0, amount: 0, withoutRate: 0, withoutClosing: 0 };
  for (const e of events) {
    if (TYPES_REQUIRING_CLOSING.includes(e.type) && e.startsAt <= now && e.completion === null && e.payable) c.withoutClosing++;
    if (!countsForPayroll(e)) continue;
    const rate = effectiveRate(e, baseRate);
    const amount = rate == null ? 0 : Math.round(e.hours * rate);
    if (rate == null) c.withoutRate++;
    c.events++;
    c.hours = round(c.hours + e.hours);
    c.amount += amount;
    c.hoursByType[e.type] = round((c.hoursByType[e.type] ?? 0) + e.hours);
    c.amountByType[e.type] = (c.amountByType[e.type] ?? 0) + amount;
  }
  return c;
}

const round = (n: number) => Math.round(n * 100) / 100;
