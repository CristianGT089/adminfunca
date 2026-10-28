import { test } from "node:test";
import assert from "node:assert/strict";
import { SHIFT_DEFINITION, endDateForHours, hoursPerSession, firstSession, shiftSessions } from "../src/lib/modules/schedule/shifts";

test("shifts have the expected hours per session", () => {
  assert.equal(hoursPerSession("DAYTIME"), 5);
  assert.equal(hoursPerSession("EVENING"), 3);
  assert.equal(hoursPerSession("SATURDAY"), 9);
  assert.deepEqual(SHIFT_DEFINITION.DAYTIME.days, [2, 3, 4]);
});

test("daytime: between Monday 5 and Sunday 18 October 2026 there are 6 sessions (Tue, Wed, Thu × 2)", () => {
  const s = shiftSessions("DAYTIME", new Date(2026, 9, 5), new Date(2026, 9, 18));
  assert.equal(s.length, 6);
  assert.deepEqual(
    s.map((d) => d.getDay()),
    [2, 3, 4, 2, 3, 4]
  );
});

test("saturdays: only counts Saturdays, including the end date", () => {
  const s = shiftSessions("SATURDAY", new Date(2026, 9, 1), new Date(2026, 9, 31));
  assert.equal(s.length, 5); // 3, 10, 17, 24 and 31 October 2026
  assert.equal(s[4].getDate(), 31);
});

test("the proposed end date completes exactly the module hours", () => {
  // 40 h in the evening shift = 14 sessions (13.3 → 14). From Monday 5 October: ends Thursday 22.
  const end = endDateForHours("EVENING", new Date(2026, 9, 5), 40);
  assert.ok(end);
  assert.equal(end!.getDate(), 22);
  assert.equal(shiftSessions("EVENING", new Date(2026, 9, 5), end!).length, 14);
});

test("the first session skips to the next valid day", () => {
  // Monday 5 → daytime starts Tuesday 6.
  assert.equal(firstSession("DAYTIME", new Date(2026, 9, 5)).getDate(), 6);
  // Friday 9 → saturdays starts Saturday 10.
  assert.equal(firstSession("SATURDAY", new Date(2026, 9, 9)).getDate(), 10);
});
