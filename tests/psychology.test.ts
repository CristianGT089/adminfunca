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

test("monthly limit: cancelled requests and expired links do not count", () => {
  const now = new Date("2026-10-15T12:00:00");
  assert.equal(countsTowardLimit({ status: "ATTENDED", tokenExpiresAt: null }, now), true);
  assert.equal(countsTowardLimit({ status: "CANCELLED", tokenExpiresAt: null }, now), false);
  assert.equal(countsTowardLimit({ status: "PENDING_VERIFICATION", tokenExpiresAt: new Date("2026-10-16T00:00:00") }, now), true);
  assert.equal(countsTowardLimit({ status: "PENDING_VERIFICATION", tokenExpiresAt: new Date("2026-10-14T00:00:00") }, now), false);
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
