import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, PERMISSIONS_BY_ROLE, ROLES, hasPermission } from "../src/lib/core/permissions";

test("every role has a row in the matrix and only uses known permissions", () => {
  for (const role of ROLES) {
    assert.ok(PERMISSIONS_BY_ROLE[role], `missing ${role}`);
    for (const p of PERMISSIONS_BY_ROLE[role]) assert.ok((PERMISSIONS as readonly string[]).includes(p), `${role}: unknown permission ${p}`);
  }
});

test("the administrative assistant records loans but does not see full documents nor manage users", () => {
  assert.equal(hasPermission("ADMINISTRATIVE_ASSISTANT", "inventory.loan"), true);
  assert.equal(hasPermission("ADMINISTRATIVE_ASSISTANT", "inventory.people.viewDocument"), false);
  assert.equal(hasPermission("ADMINISTRATIVE_ASSISTANT", "users.manage"), false);
});

test("only ADMIN manages users", () => {
  assert.deepEqual(
    ROLES.filter((r) => hasPermission(r, "users.manage")),
    ["ADMIN"]
  );
});

test("psychology clinical data is only visible to the psychology role (not even the administrator)", () => {
  assert.deepEqual(
    ROLES.filter((r) => hasPermission(r, "psychology.attend")),
    ["PSYCHOLOGY"]
  );
});

test("assistant and coordinations register appointment requests and see their status", () => {
  for (const r of ["ADMINISTRATIVE_ASSISTANT", "ACADEMIC_COORDINATION", "ADMINISTRATIVE_COORDINATION"] as const) {
    assert.equal(hasPermission(r, "psychology.request"), true, r);
    assert.equal(hasPermission(r, "psychology.view"), true, r);
  }
});

test("academic coordination approves payroll and administrative coordination pays it", () => {
  assert.equal(hasPermission("ACADEMIC_COORDINATION", "payroll.manage"), true);
  assert.equal(hasPermission("ACADEMIC_COORDINATION", "payroll.pay"), false);
  assert.equal(hasPermission("ADMINISTRATIVE_COORDINATION", "payroll.pay"), true);
  assert.equal(hasPermission("ADMINISTRATIVE_COORDINATION", "payroll.manage"), false);
});

test("psychology and internships see neither inventory nor payroll", () => {
  for (const r of ["PSYCHOLOGY", "INTERNSHIP_COORDINATION"] as const) {
    assert.equal(hasPermission(r, "inventory.view"), false, r);
    assert.equal(hasPermission(r, "payroll.view"), false, r);
    assert.equal(hasPermission(r, "schedule.own"), true, r);
  }
});

test("hasPermission accepts a list and one is enough", () => {
  assert.equal(hasPermission("INTERNSHIP_COORDINATION", ["schedule.manage", "schedule.fieldTrips"]), true);
  assert.equal(hasPermission("PSYCHOLOGY", ["schedule.manage", "schedule.fieldTrips"]), false);
});
