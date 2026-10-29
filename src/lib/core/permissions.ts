/**
 * Permission matrix per role. Single source of truth: navigation, screens and endpoints all
 * ask here. Each permission is "module.action" and is either a READ permission (see data) or a
 * WRITE permission (change data). A new role = one row in PERMISSIONS_BY_ROLE.
 *
 * Rules every module follows:
 * - every GET endpoint requires a read permission of its module; every POST/PATCH/PUT/DELETE a
 *   write permission;
 * - a write permission implies the module's read permission (`withImplied`), so a role cannot
 *   change what it cannot see;
 * - screens hide the write controls when the user lacks the write permission (the endpoint
 *   refuses anyway).
 *
 * This file imports nothing from the server so it can also be used on the client (to decide
 * what to show; real enforcement happens in the endpoints with `requirePermission`).
 */
import type { Role } from "@prisma/client";

export type Access = "read" | "write";

/** Permissions grouped by module, with their level and the Spanish label shown in the UI. */
export const PERMISSION_GROUPS = [
  {
    module: "Usuarios y roles",
    permissions: [
      { key: "users.view", access: "read", label: "Ver cuentas" },
      { key: "users.manage", access: "write", label: "Crear, editar y desactivar cuentas" },
    ],
  },
  { module: "Auditoría", permissions: [{ key: "audit.view", access: "read", label: "Ver la bitácora" }] },
  {
    module: "Inventario",
    permissions: [
      { key: "inventory.view", access: "read", label: "Ver elementos e historial" },
      { key: "inventory.people.view", access: "read", label: "Ver personas" },
      { key: "inventory.people.viewDocument", access: "read", label: "Ver el documento completo" },
      { key: "inventory.reports", access: "read", label: "Exportar reportes (CSV)" },
      { key: "inventory.loan", access: "write", label: "Entregar y recibir elementos" },
      { key: "inventory.items.manage", access: "write", label: "Crear y editar elementos" },
      { key: "inventory.people.manage", access: "write", label: "Crear y editar personas" },
    ],
  },
  {
    module: "Docentes",
    permissions: [
      { key: "teachers.view", access: "read", label: "Ver docentes" },
      { key: "teachers.manage", access: "write", label: "Crear y editar docentes" },
    ],
  },
  {
    module: "Módulos académicos",
    permissions: [
      { key: "modules.view", access: "read", label: "Ver módulos" },
      { key: "modules.manage", access: "write", label: "Crear y editar módulos" },
    ],
  },
  {
    module: "Agenda",
    permissions: [
      { key: "schedule.view", access: "read", label: "Ver la agenda general" },
      { key: "schedule.ownView", access: "read", label: "Ver mi agenda (registros propios)" },
      { key: "schedule.manage", access: "write", label: "Gestionar cualquier registro" },
      { key: "schedule.fieldTrips", access: "write", label: "Programar prácticas / salidas" },
      { key: "schedule.own", access: "write", label: "Registrar y cerrar en mi agenda" },
    ],
  },
  {
    module: "Psicología",
    permissions: [
      { key: "psychology.view", access: "read", label: "Ver el estado de las solicitudes (sin datos clínicos)" },
      { key: "psychology.request", access: "write", label: "Registrar solicitudes" },
      { key: "psychology.attend", access: "write", label: "Atender casos (datos clínicos)" },
    ],
  },
  {
    module: "Horas y nómina",
    permissions: [
      { key: "payroll.view", access: "read", label: "Ver horas y estado del mes" },
      { key: "payroll.manage", access: "write", label: "Revisar, fijar tarifas y aprobar" },
      { key: "payroll.pay", access: "write", label: "Registrar pagos" },
    ],
  },
  {
    module: "Proyección",
    permissions: [
      { key: "projection.view", access: "read", label: "Abrir la pantalla de proyección" },
      { key: "projection.manage", access: "write", label: "Cambiar la lista de reproducción" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];
export const PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

/** Read permission implied by each write permission. */
const IMPLIES: Partial<Record<Permission, Permission>> = {
  "users.manage": "users.view",
  "inventory.loan": "inventory.view",
  "inventory.items.manage": "inventory.view",
  "inventory.people.manage": "inventory.people.view",
  "teachers.manage": "teachers.view",
  "modules.manage": "modules.view",
  "schedule.manage": "schedule.view",
  "schedule.fieldTrips": "schedule.view",
  "schedule.own": "schedule.ownView",
  "psychology.request": "psychology.view",
  "psychology.attend": "psychology.view",
  "payroll.manage": "payroll.view",
  "payroll.pay": "payroll.view",
  "projection.manage": "projection.view",
};

function withImplied(list: Permission[]): Permission[] {
  const all = new Set(list);
  for (const p of list) {
    const implied = IMPLIES[p];
    if (implied) all.add(implied);
  }
  return PERMISSIONS.filter((p) => all.has(p));
}

// Psychology clinical data belongs only to psychologists: not even IT can see it.
const PROFESSIONAL_ONLY: Permission[] = ["psychology.attend"];
const ALL: Permission[] = PERMISSIONS.filter((p) => !PROFESSIONAL_ONLY.includes(p));

export const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  ADMIN: ALL,
  ADMINISTRATIVE_COORDINATION: withImplied([
    "users.view",
    "audit.view",
    "inventory.loan",
    "inventory.items.manage",
    "inventory.people.manage",
    "inventory.people.viewDocument",
    "inventory.reports",
    "payroll.pay",
    "teachers.view",
    "modules.view",
    "schedule.view",
    "psychology.request",
  ]),
  ACADEMIC_COORDINATION: withImplied([
    "inventory.view",
    "inventory.people.view",
    "inventory.reports",
    "payroll.manage",
    "teachers.manage",
    "modules.manage",
    "schedule.manage",
    "psychology.request",
  ]),
  ADMINISTRATIVE_ASSISTANT: withImplied(["schedule.view", "psychology.request", "inventory.loan", "inventory.items.manage", "inventory.people.manage"]),
  PSYCHOLOGY: withImplied(["schedule.own", "psychology.request", "psychology.attend"]),
  INTERNSHIP_COORDINATION: withImplied(["schedule.fieldTrips", "schedule.own", "teachers.view", "modules.view"]),
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

/** Highest access a role has in a module ("write" if it holds any write permission of it). */
export function moduleAccess(role: Role, group: (typeof PERMISSION_GROUPS)[number]): Access | null {
  const held = group.permissions.filter((p) => hasPermission(role, p.key));
  if (held.length === 0) return null;
  return held.some((p) => p.access === "write") ? "write" : "read";
}
