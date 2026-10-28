"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { request } from "@/components/core/useSession";
import { Alert, Empty, Field, Modal, PageHeader } from "@/components/core/ui";
import type { PublicModule } from "@/lib/modules/academic/service";

type FormState = { name: string; program: string; hours: string };
const empty: FormState = { name: "", program: "", hours: "" };

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  // Came from the teacher form via «Agregar módulo nuevo»: the form opens and, on save, goes back.
  const returnTo = params.get("returnTo");
  const [modules, setModules] = useState<PublicModule[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PublicModule | "new" | null>(params.get("new") === "1" ? "new" : null);
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      request<{ modules: PublicModule[] }>("/api/modules").then(({ ok, data }) => {
        if (ok) setModules(data.modules);
      }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  function open(m: PublicModule | "new") {
    setError(null);
    setEditing(m);
    setForm(m === "new" ? empty : { name: m.name, program: m.program, hours: m.hours?.toString() ?? "" });
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const url = editing === "new" ? "/api/modules" : `/api/modules/${(editing as PublicModule).id}`;
    const { ok, data } = await request<{ module: PublicModule }>(url, {
      method: editing === "new" ? "POST" : "PATCH",
      json: { name: form.name, program: form.program, hours: form.hours ? Number(form.hours) : null },
    });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo guardar");
    setEditing(null);
    if (returnTo && editing === "new") {
      router.push(`${returnTo}${returnTo.includes("?") ? "&" : "?"}newModule=${data.module.id}`);
      return;
    }
    load();
  }

  async function toggleActive(m: PublicModule) {
    await request(`/api/modules/${m.id}`, { method: "PATCH", json: { name: m.name, program: m.program, hours: m.hours, active: !m.active } });
    load();
  }

  const filter = q.trim().toLowerCase();
  const visible = (modules ?? []).filter((m) => !filter || m.name.toLowerCase().includes(filter) || m.program.toLowerCase().includes(filter));
  const programs = Array.from(new Set((modules ?? []).map((m) => m.program))).sort();
  const field = (k: keyof FormState) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <PageHeader
        eyebrow="Coordinación académica"
        title="Módulos académicos"
        text="Asignaturas de cada programa. Se asignan a los docentes en su perfil y son la base de la nómina."
        action={
          <button type="button" onClick={() => open("new")} className="btn-cta">
            Nuevo módulo
          </button>
        }
      />

      <input className="field max-w-sm" placeholder="Buscar por nombre o programa" value={q} onChange={(e) => setQ(e.target.value)} />

      {modules === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : visible.length === 0 ? (
        <Empty>No hay módulos registrados.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Programa</th>
                <th>Módulo</th>
                <th>Horas</th>
                <th>Docentes</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                  <td data-t="Programa" className="text-slate-600">{m.program}</td>
                  <td className="font-semibold text-blue-900">{m.name}</td>
                  <td data-t="Horas">{m.hours ?? "—"}</td>
                  <td data-t="Docentes">
                    <Link href={`/panel/docentes?q=${encodeURIComponent(m.name)}`} className="text-blue-800 hover:underline">
                      {m.teachers}
                    </Link>
                  </td>
                  <td data-t="Estado">{m.active ? <span className="pill bg-emerald-100 text-emerald-700">Activo</span> : <span className="pill bg-slate-100 text-slate-500">Inactivo</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" onClick={() => open(m)} className="btn-soft px-3 py-1 text-xs mr-1">
                      Editar
                    </button>
                    <button type="button" onClick={() => toggleActive(m)} className="btn px-3 py-1 text-xs text-slate-500 hover:bg-slate-100">
                      {m.active ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        title={editing === "new" ? "Nuevo módulo" : "Editar módulo"}
        open={!!editing}
        onClose={() => {
          setEditing(null);
          if (returnTo) router.push(returnTo);
        }}
      >
        <form onSubmit={save} className="flex flex-col gap-4">
          {returnTo && <Alert type="info">Al guardar, volverá al formulario del docente con este módulo seleccionado.</Alert>}
          <Field label="Programa">
            <input className="field" list="programs" required {...field("program")} autoFocus />
            <datalist id="programs">
              {programs.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Nombre del módulo">
            <input className="field" required {...field("name")} />
          </Field>
          <Field label="Horas (opcional)" help="Intensidad horaria de referencia.">
            <input className="field w-32" type="number" min={0} {...field("hours")} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-cta">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                if (returnTo) router.push(returnTo);
              }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export default function ModulesPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
