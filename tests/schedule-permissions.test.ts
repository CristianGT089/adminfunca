import { test } from "node:test";
import assert from "node:assert/strict";
import { ownTypes, managedTypes } from "../src/lib/modules/schedule/permissions";
import { eventSchema } from "../src/lib/modules/schedule/schemas";

test("internship coordination only manages internships / field trips", () => {
  assert.deepEqual(managedTypes("INTERNSHIP_COORDINATION"), ["FIELD_TRIP"]);
  assert.deepEqual(ownTypes("INTERNSHIP_COORDINATION"), ["FIELD_TRIP"]);
  assert.equal(managedTypes("ACADEMIC_COORDINATION").length, 6);
  assert.deepEqual(managedTypes("PSYCHOLOGY"), []);
  assert.deepEqual(ownTypes("PSYCHOLOGY"), ["PSYCHOLOGY_SESSION"]);
});

const base = { title: "Curso de primeros auxilios", startsAt: "2026-10-20T13:00:00.000Z", endsAt: "2026-10-20T17:00:00.000Z" };

test("a course requires the hourly rate", () => {
  assert.equal(eventSchema.safeParse({ ...base, type: "COURSE" }).success, false);
  assert.equal(eventSchema.safeParse({ ...base, type: "COURSE", hourlyRate: 45000 }).success, true);
  assert.equal(eventSchema.safeParse({ ...base, type: "DIPLOMA" }).success, true);
});

test("modality defaults to in person", () => {
  const r = eventSchema.parse({ ...base, type: "OTHER" });
  assert.equal(r.modality, "IN_PERSON");
});
