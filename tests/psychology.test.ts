import { test } from "node:test";
import assert from "node:assert/strict";
import { countsTowardLimit, requestSchema, statusAfterFeedback, feedbackSchema } from "../src/lib/modules/psychology/schemas";
import { isInstitutionalEmail } from "../src/lib/core/mail";
import { allow } from "../src/lib/core/rateLimit";

test("request status according to the feedback", () => {
  assert.equal(statusAfterFeedback({ attendance: "ATTENDED", referral: "NONE" }), "ATTENDED");
  assert.equal(statusAfterFeedback({ attendance: "ATTENDED", referral: "EPS" }), "REFERRED");
  assert.equal(statusAfterFeedback({ attendance: "NO_SHOW", referral: "NONE" }), "NO_SHOW");
  assert.equal(statusAfterFeedback({ attendance: "CANCELLED", referral: "NONE" }), "CANCELLED");
});

test("if the person attended, the feedback requires the reason", () => {
  assert.equal(feedbackSchema.safeParse({ attendance: "ATTENDED" }).success, false);
  assert.equal(feedbackSchema.safeParse({ attendance: "ATTENDED", reasonCategory: "ACADEMIC" }).success, true);
  assert.equal(feedbackSchema.safeParse({ attendance: "NO_SHOW" }).success, true);
});

test("monthly limit: only appointments that took place this month count", () => {
  const now = new Date("2026-10-15T12:00:00");
  const thisMonth = new Date("2026-10-02T09:00:00");
  assert.equal(countsTowardLimit({ status: "ATTENDED", appointmentAt: thisMonth }, now), true);
  assert.equal(countsTowardLimit({ status: "REFERRED", appointmentAt: thisMonth }, now), true);
  for (const status of ["PENDING_VERIFICATION", "PENDING", "TAKEN", "SCHEDULED", "NO_SHOW", "CANCELLED"] as const) {
    assert.equal(countsTowardLimit({ status, appointmentAt: thisMonth }, now), false, status);
  }
});

test("monthly limit: the appointment date decides the month, not the request date", () => {
  const now = new Date("2026-10-15T12:00:00");
  assert.equal(countsTowardLimit({ status: "ATTENDED", appointmentAt: new Date("2026-09-30T16:00:00") }, now), false);
  assert.equal(countsTowardLimit({ status: "ATTENDED", appointmentAt: new Date("2026-11-01T08:00:00") }, now), false);
  assert.equal(countsTowardLimit({ status: "ATTENDED", appointmentAt: new Date("2025-10-10T08:00:00") }, now), false);
  assert.equal(countsTowardLimit({ status: "ATTENDED", appointmentAt: null }, now), false);
  assert.equal(countsTowardLimit({ status: "ATTENDED", appointmentAt: new Date("2026-10-31T23:00:00") }, now), true);
});

test("the request requires accepting the data policy", () => {
  const data = { firstNames: "Laura", lastNames: "Gómez", document: "1012345678", phone: "3001234567", email: "laura@funca.edu.co" };
  assert.equal(requestSchema.safeParse(data).success, false);
  assert.equal(requestSchema.safeParse({ ...data, acceptsPolicy: true }).success, true);
});

test("institutional email: exact domain or subdomain", () => {
  const d = ["funca.edu.co"];
  assert.equal(isInstitutionalEmail("ana@funca.edu.co", d), true);
  assert.equal(isInstitutionalEmail("ANA@Estudiantes.Funca.edu.co", d), true);
  assert.equal(isInstitutionalEmail("ana@gmail.com", d), false);
  assert.equal(isInstitutionalEmail("ana@funca.edu.co.evil.com", d), false);
  assert.equal(isInstitutionalEmail("ana@otrafunca.edu.co", d), false);
});

test("request limit per window", () => {
  const t = 1_000_000;
  assert.equal(allow("test", 2, 1000, t), true);
  assert.equal(allow("test", 2, 1000, t + 1), true);
  assert.equal(allow("test", 2, 1000, t + 2), false);
  assert.equal(allow("test", 2, 1000, t + 1500), true);
});
