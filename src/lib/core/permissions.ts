/**
 * Permission matrix per role. Single source of truth: navigation, screens and endpoints all
 * ask here. Each permission is "module.action". A new role = one row.
 *
 * This file imports nothing from the server so it can also be used on the client (to decide
 * what to show; real enforcement happens in the endpoints with `requirePermission`).
 */
import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "users.view",
  "users.manage",
  "audit.view",
  "inventory.view",
  "inventory.loan", // hand out and receive items
  "inventory.items.manage",
  "inventory.people.view",
  "inventory.people.manage",
  "inventory.people.viewDocument", // see the full document number
  "inventory.reports",
  "payroll.view", // hours and status of the month's payroll
  "payroll.manage", // review requirements, rates and approve the month
  "payroll.pay", // record the payment
  "teachers.view",
  "teachers.manage",
  "modules.manage", // academic modules
  "schedule.view",
  "schedule.manage", // any schedule entry
  "schedule.fieldTrips", // schedule field trips / internship visits for any person in charge
  "schedule.own", // "My schedule": see and close one's own entries (account linked to a person)
  "psychology.view", // status of consultation requests (no clinical data)
  "psychology.request", // register a consultation request
  "psychology.attend", // take, schedule and record feedback (clinical data)
  "projection.manage", // event projection screen (YouTube playlist)
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Psychology clinical data belongs only to psychologists: not even IT can see it.
const PROFESSIONAL_ONLY: Permission[] = ["psychology.attend"];
const ALL: Permission[] = PERMISSIONS.filter((p) => !PROFESSIONAL_ONLY.includes(p));

export const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  ADMIN: ALL,
  ADMINISTRATIVE_COORDINATION: [
    "users.view",
    "audit.view",
    "inventory.view",
    "inventory.loan",
    "inventory.items.manage",
    "inventory.people.view",
    "inventory.people.manage",
    "inventory.people.viewDocument",
    "inventory.reports",
    "payroll.view",
    "payroll.pay",
    "teachers.view",
    "schedule.view",
    "psychology.view",
    "psychology.request",
  ],
  ACADEMIC_COORDINATION: [
    "inventory.view",
    "inventory.people.view",
    "inventory.reports",
    "payroll.view",
    "payroll.manage",
    "teachers.view",
    "teachers.manage",
    "modules.manage",
    "schedule.view",
    "schedule.manage",
    "psychology.view",
    "psychology.request",
  ],
  ADMINISTRATIVE_ASSISTANT: [
    "schedule.view",
    "psychology.view",
    "psychology.request",
    "inventory.view",
    "inventory.loan",
    "inventory.items.manage",
    "inventory.people.view",
    "inventory.people.manage",
  ],
  PSYCHOLOGY: ["schedule.own", "psychology.view", "psychology.request", "psychology.attend"],
  INTERNSHIP_COORDINATION: ["schedule.view", "schedule.fieldTrips", "schedule.own", "teachers.view"],
};

// Role names as shown in the interface.
export const ROLE_NAME: Record<Role, string> = {
  ADMIN: "Administrador del sistema",
  ACADEMIC_COORDINATION: "Coordinación académica",
  ADMINISTRATIVE_COORDINATION: "Coordinación administrativa",
  ADMINISTRATIVE_ASSISTANT: "Asistente administrativo",
  PSYCHOLOGY: "Psicología",
  INTERNSHIP_COORDINATION: "Coordinación de prácticas",
};

/** Roles whose account belongs to a person doing activities paid by the hour. */
export const PROFESSIONAL_ROLES: Role[] = ["PSYCHOLOGY", "INTERNSHIP_COORDINATION"];

export const ROLES: Role[] = [
  "ADMIN",
  "ADMINISTRATIVE_COORDINATION",
  "ACADEMIC_COORDINATION",
  "ADMINISTRATIVE_ASSISTANT",
  "PSYCHOLOGY",
  "INTERNSHIP_COORDINATION",
];

export function hasPermission(role: Role, permission: Permission | Permission[]): boolean {
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some((p) => PERMISSIONS_BY_ROLE[role]?.includes(p) ?? false);
}

export function permissionsOf(role: Role): Permission[] {
  return PERMISSIONS_BY_ROLE[role] ?? [];
}
