import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../src/lib/modules/payroll/calculation";
import { requirementsMet } from "../src/lib/modules/payroll/schemas";

const yesterday = new Date(Date.now() - 86400000);
const tomorrow = new Date(Date.now() + 86400000);
const ev = (o: Partial<Parameters<typeof calculate>[0][number]>) => ({ type: "MODULE_CLASS" as const, hours: 2, hourlyRate: null, payable: true, completion: null, startsAt: yesterday, ...o });

test("uses the entry's rate and, if it has none, the person's base rate", () => {
  const c = calculate([ev({ hours: 4 }), ev({ type: "COURSE", hours: 3, hourlyRate: 50000 })], 20000);
  assert.equal(c.amount, 4 * 20000 + 3 * 50000);
  assert.equal(c.hours, 7);
  assert.deepEqual(c.hoursByType, { MODULE_CLASS: 4, COURSE: 3 });
  assert.equal(c.withoutRate, 0);
});

test("without a base rate it counts the entries without a rate", () => {
  const c = calculate([ev({}), ev({ type: "COURSE", hourlyRate: 40000 })], null);
  assert.equal(c.withoutRate, 1);
  assert.equal(c.amount, 80000);
});

test("non-payable and cancelled entries don't count; not completed ones do", () => {
  const c = calculate([ev({ payable: false }), ev({ completion: "CANCELLED" }), ev({ type: "PSYCHOLOGY_SESSION", completion: "NOT_COMPLETED" })], 10000);
  assert.equal(c.events, 1);
  assert.equal(c.hours, 2);
});

test("past field trips and consultations without closing stay pending; future ones don't", () => {
  const c = calculate([ev({ type: "FIELD_TRIP" }), ev({ type: "PSYCHOLOGY_SESSION", startsAt: tomorrow }), ev({ type: "MODULE_CLASS" })], 10000);
  assert.equal(c.withoutClosing, 1);
});

test("requirements are complete only with both the automatic and the manual ones", () => {
  const all = { hoursReviewed: true, confirmation: true, invoice: true, socialSecurity: true };
  assert.equal(requirementsMet({ withoutRate: 0, withoutClosing: 0 }, all).complete, true);
  assert.equal(requirementsMet({ withoutRate: 1, withoutClosing: 0 }, all).complete, false);
  const r = requirementsMet({ withoutRate: 0, withoutClosing: 0 }, { confirmation: true });
  assert.equal(r.complete, false);
  assert.equal(r.met, 3);
  assert.equal(r.total, 6);
});
