"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, Empty, Field, Modal, PageHeader } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import type { PublicModule, PublicTeacher } from "@/lib/modules/academic/service";
import { DOCUMENT_TYPES } from "@/lib/modules/inventory/schemas";

type FormState = {
  firstNames: string;
  lastNames: string;
  documentType: string;
  document: string;
  cardCode: string;
  program: string;
  email: string;
  phone: string;
  moduleIds: string[];
};
const empty: FormState = { firstNames: "", lastNames: "", documentType: "CC", document: "", cardCode: "", program: "", email: "", phone: "", moduleIds: [] };
const DRAFT = "admin-funca:teacher-draft";

function Content() {
  const { can } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [teachers, setTeachers] = useState<PublicTeacher[] | null>(null);
  const [modules, setModules] = useState<PublicModule[]>([]);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [editing, setEditing] = useState<PublicTeacher | "new" | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<PublicTeacher | null>(null);

  const load = useCallback(
    () =>
      Promise.all([request<{ teachers: PublicTeacher[] }>(`/api/teachers?q=${encodeURIComponent(q)}`), request<{ modules: PublicModule[] }>("/api/modules?active=1")]).then(([t, m]) => {
        if (t.ok) setTeachers(t.data.teachers);
        if (m.ok) setModules(m.data.modules);
      }),
    [q]
  );

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Back from «Agregar módulo nuevo»: the draft is restored and the newly created module is checked.
  const newModule = params.get("newModule");
  useEffect(() => {
    if (!newModule) return;
    let draft: { editingId: string | null; form: FormState } | null = null;
    // Read without deleting: in development React runs the effect twice. Deleted when done.
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null");
    } catch {}
    const base = draft?.form ?? empty;
    const restored = { ...base, moduleIds: Array.from(new Set([...base.moduleIds, newModule])) };
    const editingId = draft?.editingId ?? null;
    const finish = (teacher: PublicTeacher | null) => {
      setEditing(teacher ?? "new");
      setForm(restored);
      try {
        sessionStorage.removeItem(DRAFT);
      } catch {}
      router.replace("/panel/docentes");
    };
    // Only an existing teacher has to be reloaded; a new one needs no request.
    if (editingId) request<{ teacher: PublicTeacher }>(`/api/teachers/${editingId}`).then(({ ok, data }) => finish(ok ? data.teacher : null));
    else finish(null);
  }, [newModule, router]);

  const manages = can("teachers.manage");
  const seesDocument = can("inventory.people.viewDocument");

  function open(t: PublicTeacher | "new") {
    setError(null);
    setEditing(t);
    setForm(
      t === "new"
        ? empty
        : {
            firstNames: t.firstNames,
            lastNames: t.lastNames,
            documentType: t.documentType,
            document: t.documentFull ? t.document : "",
            cardCode: t.cardCode ?? "",
            program: t.program ?? "",
            email: t.email ?? "",
            phone: t.documentFull ? (t.phone ?? "") : "",
            moduleIds: t.modules.map((m) => m.id),
          }
    );
  }

  function goToCreateModule() {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({ editingId: editing && editing !== "new" ? editing.id : null, form }));
    } catch {}
    router.push("/panel/modulos?new=1&returnTo=/panel/docentes");
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const url = editing === "new" ? "/api/teachers" : `/api/teachers/${(editing as PublicTeacher).id}`;
    const { ok, data } = await request(url, { method: editing === "new" ? "POST" : "PATCH", json: form });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo guardar");
    setEditing(null);
    load();
  }

  async function toggleActive(t: PublicTeacher) {
    await request(`/api/teachers/${t.id}`, { method: "PATCH", json: { active: !t.active } });
    load();
  }

  const field = (k: Exclude<keyof FormState, "moduleIds">) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }) });
  const programs = Array.from(new Set(modules.map((m) => m.program))).sort();
  const toggleModule = (id: string) => setForm((f) => ({ ...f, moduleIds: f.moduleIds.includes(id) ? f.moduleIds.filter((x) => x !== id) : [...f.moduleIds, id] }));

  return (
    <>
      <PageHeader
        eyebrow="Coordinación académica"
        title="Docentes"
        text="Perfil de cada docente y los módulos que dicta. Los docentes también pueden recibir elementos del inventario."
        action={
          manages && (
            <button type="button" onClick={() => open("new")} className="btn-cta">
              Nuevo docente
            </button>
          )
        }
      />

      <input className="field max-w-sm" placeholder="Buscar por nombre, programa o módulo" value={q} onChange={(e) => setQ(e.target.value)} />

      {teachers === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : teachers.length === 0 ? (
        <Empty>No hay docentes registrados.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Docente</th>
                <th>Documento</th>
                <th>Programa / área</th>
                <th>Módulos que dicta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className={t.active ? "" : "opacity-50"}>
                  <td>
                    <button type="button" onClick={() => setDetail(t)} className="font-semibold text-blue-900 hover:underline text-left">
                      {t.lastNames}, {t.firstNames}
                    </button>
                    <span className="block text-xs text-slate-500">{[t.email, t.phone].filter(Boolean).join(" · ")}{!t.active && " · inactivo"}</span>
                  </td>
                  <td data-t="Documento" className="font-mono text-xs text-slate-600">
                    {t.documentType} {t.document}
                  </td>
                  <td data-t="Programa" className="text-slate-600">{t.program ?? "—"}</td>
                  <td data-t="Módulos">
                    {t.modules.length === 0 ? (
                      <span className="text-slate-400">Sin módulos</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {t.modules.map((m) => (
                          <span key={m.id} className="pill bg-blue-100 text-blue-800" title={m.program}>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {manages && (
                      <>
                        <button type="button" onClick={() => open(t)} className="btn-soft px-3 py-1 text-xs mr-1">
                          Editar
                        </button>
                        <button type="button" onClick={() => toggleActive(t)} className="btn px-3 py-1 text-xs text-slate-500 hover:bg-slate-100">
                          {t.active ? "Desactivar" : "Activar"}
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

      <Modal title={editing === "new" ? "Nuevo docente" : "Editar docente"} open={!!editing && manages} onClose={() => setEditing(null)} width="max-w-3xl">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres">
            <input className="field" required {...field("firstNames")} autoFocus />
          </Field>
          <Field label="Apellidos">
            <input className="field" required {...field("lastNames")} />
          </Field>
          <Field label="Tipo de documento">
            <Selector value={form.documentType} onChange={(v) => setForm({ ...form, documentType: v })} searchable={false} options={DOCUMENT_TYPES.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Número de documento" help={editing !== "new" && !seesDocument ? "Por seguridad no se muestra; escríbalo de nuevo para guardar." : "Se guarda cifrado."}>
            <input className="field font-mono" required inputMode="numeric" {...field("document")} />
          </Field>
          <Field label="Programa / área principal">
            <input className="field" list="teacher-programs" {...field("program")} />
            <datalist id="teacher-programs">
              {programs.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Código del carnet" help="Solo si el carnet imprime un código distinto al documento.">
            <input className="field font-mono" {...field("cardCode")} />
          </Field>
          <Field label="Correo">
            <input className="field" type="email" {...field("email")} />
          </Field>
          <Field label="Teléfono" help="Se guarda cifrado.">
            <input className="field" inputMode="tel" {...field("phone")} />
          </Field>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="field-label mb-0">Módulos que dicta</span>
              {can("modules.manage") && (
                <button type="button" onClick={goToCreateModule} className="text-xs font-semibold text-blue-800 hover:underline">
                  + Agregar módulo nuevo
                </button>
              )}
            </div>
            {modules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-blue-200 px-3 py-3 text-sm text-slate-400">No hay módulos registrados. Créelos con «Agregar módulo nuevo».</p>
            ) : (
              <div className="rounded-2xl border border-blue-200 max-h-60 overflow-y-auto divide-y divide-blue-100">
                {programs.map((p) => (
                  <div key={p}>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-blue-50/60">{p}</p>
                    {modules
                      .filter((m) => m.program === p)
                      .map((m) => (
                        <label key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-blue-50/40 cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 accent-blue-800" checked={form.moduleIds.includes(m.id)} onChange={() => toggleModule(m.id)} />
                          <span className="flex-1 text-slate-800">{m.name}</span>
                          {m.hours != null && <span className="text-xs text-slate-400">{m.hours} h</span>}
                        </label>
                      ))}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {form.moduleIds.length} módulo{form.moduleIds.length === 1 ? "" : "s"} seleccionado{form.moduleIds.length === 1 ? "" : "s"}.
            </p>
          </div>

          {error && (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="btn-cta">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={detail ? detail.fullName : ""} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-slate-500">Documento</dt>
              <dd className="font-mono">
                {detail.documentType} {detail.document}
              </dd>
              <dt className="text-slate-500">Programa</dt>
              <dd>{detail.program ?? "—"}</dd>
              <dt className="text-slate-500">Contacto</dt>
              <dd>{[detail.email, detail.phone].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-slate-500">Carnet</dt>
              <dd className="font-mono">{detail.cardCode ?? "—"}</dd>
            </dl>
            <div>
              <p className="eyebrow">Módulos que dicta</p>
              {detail.modules.length === 0 ? (
                <p className="mt-2 text-slate-400">Sin módulos asignados.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {detail.modules.map((m) => (
                    <li key={m.id} className="card-sm px-3 py-2 flex justify-between gap-3">
                      <span className="font-semibold text-blue-900">{m.name}</span>
                      <span className="text-xs text-slate-500">
                        {m.program}
                        {m.hours != null ? ` · ${m.hours} h` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function TeachersPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
