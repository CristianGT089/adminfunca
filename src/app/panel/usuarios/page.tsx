"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field, CopyButton, formatDate, Modal, Empty } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import { ROLE_NAME, PERMISSION_GROUPS, PERMISSIONS_BY_ROLE, ROLES, PROFESSIONAL_ROLES, hasPermission, moduleAccess, type Access } from "@/lib/core/permissions";
import { DOCUMENT_TYPES } from "@/lib/modules/inventory/schemas";

type UserRow = {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  lockedUntil: string | null;
  createdBy: { id: string; name: string } | null;
  person: { id: string; firstNames: string; lastNames: string; documentLast4: string } | null;
};

export default function UsersPage() {
  const { session, can } = useSession();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", role: "ADMINISTRATIVE_ASSISTANT" as Role, documentType: "CC", document: "" });
  const [linking, setLinking] = useState<UserRow | null>(null);
  const [link, setLink] = useState({ documentType: "CC", document: "" });
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [showRoles, setShowRoles] = useState(false);

  const load = useCallback(
    () =>
      request<{ users: UserRow[] }>("/api/users").then(({ ok, data }) => {
        if (ok) setUsers(data.users);
      }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const manages = can("users.manage");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { ok, data } = await request<{ user: UserRow; temporaryPassword: string }>("/api/users", { method: "POST", json: { ...form, document: form.document || null } });
    if (!ok) return setError(data.error ?? "No se pudo crear");
    setCreating(false);
    setForm({ name: "", username: "", role: "ADMINISTRATIVE_ASSISTANT", documentType: "CC", document: "" });
    setCredentials({ username: data.user.username, password: data.temporaryPassword });
    load();
  }

  async function update(u: UserRow, changes: Partial<Pick<UserRow, "role" | "active">> | { link: { documentType: string; document: string } | null }) {
    setError(null);
    const { ok, data } = await request(`/api/users/${u.id}`, { method: "PATCH", json: changes });
    if (!ok) setError(data.error ?? "No se pudo guardar");
    load();
    return ok;
  }

  async function resetPassword(u: UserRow) {
    const { ok, data } = await request<{ temporaryPassword: string }>(`/api/users/${u.id}/reset-password`, { method: "POST" });
    if (ok) setCredentials({ username: u.username, password: data.temporaryPassword });
  }

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios y roles"
        text="Cuentas del personal que entra a esta plataforma. Lo que cada rol puede hacer está definido en la matriz de permisos."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowRoles(true)} className="btn-secondary">
              Ver permisos por rol
            </button>
            {manages && (
              <button type="button" onClick={() => setCreating(true)} className="btn-cta">
                Nuevo usuario
              </button>
            )}
          </div>
        }
      />

      {credentials && (
        <div className="card border-gold-500 p-5">
          <p className="eyebrow">Contraseña temporal</p>
          <p className="mt-2 text-sm text-slate-600">
            Entréguela al usuario. Se muestra una sola vez; al ingresar deberá cambiarla.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-sm">
            <span>
              Usuario: <strong>{credentials.username}</strong>
            </span>
            <span>
              Contraseña: <strong>{credentials.password}</strong>
            </span>
            <CopyButton text={`Usuario: ${credentials.username}\nContraseña: ${credentials.password}`} />
            <button type="button" onClick={() => setCredentials(null)} className="text-xs text-slate-400 hover:text-slate-600">
              Ocultar
            </button>
          </div>
        </div>
      )}

      {error && !creating && !linking && <Alert>{error}</Alert>}

      {users === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : users.length === 0 ? (
        <Empty>No hay usuarios.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Persona</th>
                <th>Último acceso</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="font-semibold text-blue-900">
                    {u.name}
                    {u.id === session?.id && <span className="ml-2 pill bg-blue-100 text-blue-800">sesión actual</span>}
                  </td>
                  <td data-t="Usuario" className="font-mono text-xs">{u.username}</td>
                  <td data-t="Rol">
                    {manages && u.id !== session?.id ? (
                      <Selector compact className="w-56" aria-label="Rol" value={u.role} onChange={(v) => update(u, { role: v as Role })} searchable={false} options={ROLES.map((r) => ({ value: r, label: ROLE_NAME[r] }))} />
                    ) : (
                      ROLE_NAME[u.role]
                    )}
                  </td>
                  <td data-t="Persona" className="text-slate-600">
                    {u.person ? (
                      <span>
                        {u.person.firstNames} {u.person.lastNames} <span className="text-xs text-slate-400">••••{u.person.documentLast4}</span>
                      </span>
                    ) : PROFESSIONAL_ROLES.includes(u.role) ? (
                      <span className="pill bg-red-100 text-red-700">Sin vincular</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                    {manages && (PROFESSIONAL_ROLES.includes(u.role) || u.person) && (
                      <button type="button" onClick={() => { setLink({ documentType: "CC", document: "" }); setLinking(u); }} className="ml-2 text-xs font-semibold text-blue-800 hover:underline">
                        {u.person ? "Cambiar" : "Vincular"}
                      </button>
                    )}
                  </td>
                  <td data-t="Último acceso" className="text-slate-500">{formatDate(u.lastLoginAt)}</td>
                  <td data-t="Estado">
                    {!u.active ? (
                      <span className="pill bg-slate-100 text-slate-500">Inactivo</span>
                    ) : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                      <span className="pill bg-red-100 text-red-700">Bloqueado</span>
                    ) : u.mustChangePassword ? (
                      <span className="pill bg-gold-100 text-gold-700">Contraseña temporal</span>
                    ) : (
                      <span className="pill bg-emerald-100 text-emerald-700">Activo</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {manages && u.id !== session?.id && (
                      <>
                        <button type="button" onClick={() => resetPassword(u)} className="btn-soft px-3 py-1 text-xs mr-1">
                          Nueva contraseña
                        </button>
                        <button type="button" onClick={() => update(u, { active: !u.active })} className="btn px-3 py-1 text-xs text-slate-500 hover:bg-slate-100">
                          {u.active ? "Desactivar" : "Activar"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Nuevo usuario" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={create} className="flex flex-col gap-4">
          <Field label="Nombre completo">
            <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Usuario" help="Minúsculas, sin espacios. Ej. maria.perez">
            <input className="field font-mono" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="Rol">
            <Selector value={form.role} onChange={(v) => setForm({ ...form, role: v as Role })} searchable={false} options={ROLES.map((r) => ({ value: r, label: ROLE_NAME[r], detail: `${PERMISSIONS_BY_ROLE[r].length} permisos` }))} />
          </Field>
          {PROFESSIONAL_ROLES.includes(form.role) && (
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Field label="Tipo">
                <select className="field" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Documento de la persona" help="Sus citas o prácticas se registran y se pagan a su nombre. Si ya existe como persona o docente, se vincula.">
                <input className="field" required value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
              </Field>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <button type="submit" className="btn-cta">
              Crear y generar contraseña
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>

      <Modal title="Vincular la cuenta a una persona" open={!!linking} onClose={() => { setLinking(null); setError(null); }}>
        {linking && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await update(linking, { link })) setLinking(null);
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-slate-600">
              Las actividades de <strong>{linking.name}</strong> en la agenda (citas, prácticas) quedan a nombre de esta persona y suman en su nómina. Si no existe, se crea como personal administrativo.
            </p>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Field label="Tipo">
                <select className="field" value={link.documentType} onChange={(e) => setLink({ ...link, documentType: e.target.value })}>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Número de documento">
                <input className="field" required minLength={4} value={link.document} onChange={(e) => setLink({ ...link, document: e.target.value })} autoFocus />
              </Field>
            </div>
            {error && <Alert>{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-cta">
                Vincular
              </button>
              {linking.person && (
                <button type="button" onClick={async () => (await update(linking, { link: null })) && setLinking(null)} className="btn-danger">
                  Quitar vínculo
                </button>
              )}
              <button type="button" onClick={() => setLinking(null)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title="Permisos por rol" open={showRoles} onClose={() => setShowRoles(false)} width="max-w-5xl">
        <RoleMatrix />
      </Modal>
    </>
  );
}

const ACCESS_PILL: Record<Access, { text: string; className: string }> = {
  write: { text: "Escritura", className: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
  read: { text: "Lectura", className: "bg-blue-100 text-blue-800 ring-1 ring-blue-200" },
};

function AccessPill({ access }: { access: Access | null }) {
  if (!access) return <span className="text-slate-300" aria-label="Sin acceso">—</span>;
  const p = ACCESS_PILL[access];
  return <span className={`pill whitespace-nowrap ${p.className}`}>{p.text}</span>;
}

/**
 * Module × role grid: the highest access each role has in each module. Each module expands to
 * its individual permissions. Built from PERMISSION_GROUPS, so it always matches the code.
 */
function RoleMatrix() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (module: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <AccessPill access="write" /> ve y cambia datos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AccessPill access="read" /> solo consulta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AccessPill access={null} /> sin acceso
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-blue-100">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-blue-50/70 text-[11px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="sticky left-0 z-10 min-w-[11rem] bg-blue-50 px-3 py-2 text-left font-bold">
                Módulo
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-2 py-2 text-center font-bold normal-case tracking-normal text-xs text-blue-900">
                  {ROLE_NAME[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => {
              const open = expanded.has(g.module);
              return (
                <Fragment key={g.module}>
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 border-t border-blue-100 bg-white px-1 py-1.5 text-left font-normal">
                      <button type="button" onClick={() => toggle(g.module)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-semibold text-blue-900 hover:bg-blue-50">
                        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M8 5l5 5-5 5" />
                        </svg>
                        {g.module}
                      </button>
                    </th>
                    {ROLES.map((r) => (
                      <td key={r} className="border-t border-blue-100 px-2 py-1.5 text-center">
                        <AccessPill access={moduleAccess(r, g)} />
                      </td>
                    ))}
                  </tr>
                  {open &&
                    g.permissions.map((p) => (
                      <tr key={p.key} className="bg-slate-50/70">
                        <th scope="row" className="sticky left-0 z-10 bg-slate-50 py-1.5 pr-3 pl-9 text-left text-xs font-normal text-slate-600">
                          <span className="block">{p.label}</span>
                          <span className={`mt-0.5 inline-block text-[10px] font-bold uppercase tracking-wider ${p.access === "write" ? "text-emerald-700" : "text-blue-700"}`}>
                            {p.access === "write" ? "Escritura" : "Lectura"}
                          </span>
                        </th>
                        {ROLES.map((r) => (
                          <td key={r} className="px-2 py-1.5 text-center">
                            {hasPermission(r, p.key) ? (
                              <span className="font-bold text-emerald-600" aria-label="Sí">
                                ✓
                              </span>
                            ) : (
                              <span className="text-slate-300" aria-label="No">
                                —
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Toque un módulo para ver sus permisos. Un permiso de escritura incluye siempre la lectura de su módulo. La matriz se define en el código
        (src/lib/core/permissions.ts); cambiarla requiere un despliegue.
      </p>
    </div>
  );
}
