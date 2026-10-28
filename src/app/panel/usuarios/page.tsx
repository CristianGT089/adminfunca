"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field, CopyButton, formatDate, Modal, Empty } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import { ROLE_NAME, PERMISSIONS, PERMISSIONS_BY_ROLE, ROLES, PROFESSIONAL_ROLES } from "@/lib/core/permissions";
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

const PERMISSION_DESCRIPTION: Record<string, string> = {
  "users.view": "Ver cuentas",
  "users.manage": "Crear y editar cuentas",
  "audit.view": "Ver auditoría",
  "inventory.view": "Ver inventario",
  "inventory.loan": "Entregar y recibir elementos",
  "inventory.items.manage": "Crear y editar elementos",
  "inventory.people.view": "Ver personas",
  "inventory.people.manage": "Crear y editar personas",
  "inventory.people.viewDocument": "Ver documento completo",
  "inventory.reports": "Exportar reportes",
  "payroll.view": "Ver horas y nómina del mes",
  "payroll.manage": "Revisar requisitos, tarifas y aprobar la nómina",
  "payroll.pay": "Registrar pagos de la nómina",
  "teachers.view": "Ver docentes",
  "teachers.manage": "Crear y editar docentes",
  "modules.manage": "Gestionar módulos académicos",
  "schedule.view": "Ver agenda académica",
  "schedule.manage": "Registrar en la agenda (todo)",
  "schedule.fieldTrips": "Programar prácticas / salidas",
  "schedule.own": "Mi agenda (cuenta vinculada a una persona)",
  "psychology.view": "Ver estado de solicitudes de psicología",
  "psychology.request": "Registrar solicitudes de cita",
  "psychology.attend": "Atender citas (datos clínicos)",
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

      <Modal title="Permisos por rol" open={showRoles} onClose={() => setShowRoles(false)} width="max-w-4xl">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Permiso</th>
                {ROLES.map((r) => (
                  <th key={r} className="text-center">
                    {ROLE_NAME[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td>{PERMISSION_DESCRIPTION[p] ?? p}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="text-center">
                      {PERMISSIONS_BY_ROLE[r].includes(p) ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">La matriz se define en el código (src/lib/core/permissions.ts); cambiarla requiere un despliegue.</p>
      </Modal>
    </>
  );
}
