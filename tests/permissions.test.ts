import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PERMISSION_GROUPS, PERMISSIONS, PERMISSIONS_BY_ROLE, ROLES, hasPermission, type Access } from "../src/lib/core/permissions";

const ACCESS = new Map<string, Access>(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.access] as const)));
const GROUP_OF = new Map<string, (typeof PERMISSION_GROUPS)[number]>(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, g] as const)));

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

test("every permission belongs to exactly one module and has a level", () => {
  assert.equal(ACCESS.size, PERMISSIONS.length);
  for (const p of PERMISSIONS) assert.ok(ACCESS.get(p) === "read" || ACCESS.get(p) === "write", p);
});

test("every write permission a role holds comes with a read permission of its module", () => {
  for (const role of ROLES) {
    for (const p of PERMISSIONS_BY_ROLE[role]) {
      if (ACCESS.get(p) !== "write") continue;
      const group = GROUP_OF.get(p)!;
      const reads = group.permissions.filter((x) => x.access === "read").map((x) => x.key);
      assert.ok(
        reads.some((r) => hasPermission(role, r)),
        `${role} holds ${p} (write) but none of ${reads.join(", ")} (read)`
      );
    }
  }
});

// Static check of the endpoints: GET needs read permissions, POST/PUT/PATCH/DELETE a write one.
const API_DIR = join(__dirname, "..", "src", "app", "api");
// Session endpoints, health check and the public form do not use withPermission.
const SKIPPED = ["auth", "health", "public"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return routeFiles(path);
    return e.name === "route.ts" ? [path] : [];
  });
}

/** `export const <METHOD> = withPermission(<"perm" | ["a", "b"]>` → [method, permissions]. */
function endpoints(source: string): [string, string[]][] {
  const re = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*withPermission\(\s*("[^"]+"|\[[^\]]*\])/g;
  return [...source.matchAll(re)].map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]);
}

test("endpoints: GET requires read permissions; POST/PUT/PATCH/DELETE a write permission", () => {
  const files = routeFiles(API_DIR).filter((f) => !SKIPPED.includes(relative(API_DIR, f).split(sep)[0]));
  assert.ok(files.length > 20, "no endpoints found");
  let checked = 0;
  for (const file of files) {
    const name = relative(API_DIR, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");
    const found = endpoints(source);
    // Every exported handler must go through withPermission.
    const exported = [...source.matchAll(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
    assert.deepEqual(found.map(([m]) => m).sort(), exported.sort(), `${name}: handler without withPermission`);
    for (const [method, perms] of found) {
      assert.ok(perms.length > 0, `${name} ${method}: no permission`);
      for (const p of perms) assert.ok(ACCESS.has(p), `${name} ${method}: unknown permission ${p}`);
      if (method === "GET") {
        for (const p of perms) assert.ok(ACCESS.get(p) === "read", `${name} GET requires ${p}, which is not a read permission`);
      } else {
        assert.ok(perms.some((p) => ACCESS.get(p) === "write"), `${name} ${method} requires only read permissions (${perms.join(", ")})`);
      }
      checked++;
    }
  }
  assert.ok(checked > 40, `only ${checked} handlers checked`);
});
