"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field, formatDate, Modal, PERSON_TYPE, Empty } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import type { PublicPerson, PublicLoan } from "@/lib/modules/inventory/service";
import { DOCUMENT_TYPES, PERSON_TYPES } from "@/lib/modules/inventory/schemas";

type Form = {
  type: string;
  firstNames: string;
  lastNames: string;
  documentType: string;
  document: string;
  cardCode: string;
  program: string;
  email: string;
  phone: string;
};

const DOCUMENT_NAME: Record<string, string> = { CC: "Cédula de ciudadanía", TI: "Tarjeta de identidad", CE: "Cédula de extranjería", PA: "Pasaporte", PEP: "Permiso especial de permanencia", PPT: "Permiso por protección temporal", NIT: "NIT" };

const empty: Form = { type: "STUDENT", firstNames: "", lastNames: "", documentType: "CC", document: "", cardCode: "", program: "", email: "", phone: "" };

export default function PeoplePage() {
  const { can } = useSession();
  const [people, setPeople] = useState<PublicPerson[] | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editing, setEditing] = useState<PublicPerson | "new" | null>(null);
  const [detail, setDetail] = useState<{ person: PublicPerson; loans: PublicLoan[] } | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await request<{ people: PublicPerson[] }>(`/api/inventory/people?q=${encodeURIComponent(q)}`);
    if (ok) setPeople(data.people);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const manages = can("inventory.people.manage");
  const seesDocument = can("inventory.people.viewDocument");

  function open(p: PublicPerson | "new") {
    setError(null);
    setEditing(p);
    setForm(
      p === "new"
        ? empty
        : {
            type: p.type,
            firstNames: p.firstNames,
            lastNames: p.lastNames,
            documentType: p.documentType,
            // Without permission to see the full document, the field stays empty and must be typed again.
            document: p.documentFull ? p.document : "",
            cardCode: p.cardCode ?? "",
            program: p.program ?? "",
            email: p.email ?? "",
            phone: p.documentFull ? (p.phone ?? "") : "",
          }
    );
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const url = editing === "new" ? "/api/inventory/people" : `/api/inventory/people/${(editing as PublicPerson).id}`;
    const { ok, data } = await request(url, { method: editing === "new" ? "POST" : "PATCH", json: form });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo guardar");
    setEditing(null);
    load();
  }

  async function viewDetail(p: PublicPerson) {
    const { ok, data } = await request<{ person: PublicPerson; loans: PublicLoan[] }>(`/api/inventory/people/${p.id}`);
    if (ok) setDetail(data);
  }

  async function toggleActive(p: PublicPerson) {
    await request(`/api/inventory/people/${p.id}`, { method: "PATCH", json: { active: !p.active } });
    load();
  }

  const field = (k: keyof Form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Personas"
        text="Quienes pueden recibir elementos. El número de documento se guarda cifrado y solo se muestra completo a quien tiene permiso."
        action={
          <div className="flex gap-2">
            {can("teachers.view") && (
              <Link href="/panel/docentes" className="btn-secondary">
                Docentes
              </Link>
            )}
            {manages && (
              <button type="button" onClick={() => open("new")} className="btn-cta">
                Nueva persona
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <input className="field max-w-sm" placeholder="Buscar por nombre, documento, carnet o programa" value={q} onChange={(e) => setQ(e.target.value)} />
        <Selector className="w-48" aria-label="Filtrar por tipo" value={typeFilter} onChange={setTypeFilter} empty="Todos los tipos" searchable={false} options={PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE[t] }))} />
      </div>
      {typeFilter === "TEACHER" && can("teachers.view") && (
        <p className="text-sm text-slate-500">
          El perfil completo de los docentes (módulos que dictan) se gestiona en{" "}
          <Link href="/panel/docentes" className="font-semibold text-blue-800 hover:underline">
            Docentes
          </Link>
          .
        </p>
      )}

      {people === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : people.length === 0 ? (
        <Empty>No hay personas{q ? " que coincidan con la búsqueda" : ""}.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Documento</th>
                <th>Carnet</th>
                <th>Programa / área</th>
                <th>Sin devolver</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.filter((p) => !typeFilter || p.type === typeFilter).map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td>
                    <button type="button" onClick={() => viewDetail(p)} className="font-semibold text-blue-900 hover:underline text-left">
                      {p.lastNames}, {p.firstNames}
                    </button>
                    <span className="block text-xs text-slate-500">
                      {PERSON_TYPE[p.type]}
                      {!p.active && " · inactiva"}
                    </span>
                  </td>
                  <td data-t="Documento" className="font-mono text-xs text-slate-600">
                    {p.documentType} {p.document}
                  </td>
                  <td data-t="Carnet" className="font-mono text-xs text-slate-600">{p.cardCode ?? "—"}</td>
                  <td data-t="Programa" className="text-slate-600">{p.program ?? "—"}</td>
                  <td data-t="Sin devolver">{p.openLoans ? <span className="pill bg-gold-100 text-gold-700">{p.openLoans}</span> : <span className="text-slate-400">0</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    {manages && (
                      <>
                        <button type="button" onClick={() => open(p)} className="btn-soft px-3 py-1 text-xs mr-1">
                          Editar
                        </button>
                        <button type="button" onClick={() => toggleActive(p)} className="btn px-3 py-1 text-xs text-slate-500 hover:bg-slate-100">
                          {p.active ? "Desactivar" : "Activar"}
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

      <Modal title={editing === "new" ? "Nueva persona" : "Editar persona"} open={!!editing} onClose={() => setEditing(null)} width="max-w-2xl">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Selector value={form.type} onChange={(v) => setForm({ ...form, type: v })} searchable={false} options={PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE[t] }))} />
          </Field>
          <Field label="Programa / área" help="Ej. Técnico en Enfermería, Secretaría…">
            <input className="field" {...field("program")} />
          </Field>
          <Field label="Nombres">
            <input className="field" required {...field("firstNames")} autoFocus />
          </Field>
          <Field label="Apellidos">
            <input className="field" required {...field("lastNames")} />
          </Field>
          <Field label="Tipo de documento">
            <Selector value={form.documentType} onChange={(v) => setForm({ ...form, documentType: v })} searchable={false} options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t, detail: DOCUMENT_NAME[t] }))} />
          </Field>
          <Field label="Número de documento" help={editing !== "new" && !seesDocument ? "Por seguridad no se muestra; escríbelo de nuevo para guardar." : "Se guarda cifrado."}>
            <input className="field font-mono" required inputMode="numeric" {...field("document")} />
          </Field>
          <Field label="Código del carnet" help="Solo si el carnet imprime un código distinto al documento.">
            <input className="field font-mono" {...field("cardCode")} />
          </Field>
          <Field label="Teléfono (opcional)" help="Se guarda cifrado.">
            <input className="field" inputMode="tel" {...field("phone")} />
          </Field>
          <Field label="Correo (opcional)" className="sm:col-span-2">
            <input className="field" type="email" {...field("email")} />
          </Field>
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

      <Modal title={detail ? detail.person.fullName : ""} open={!!detail} onClose={() => setDetail(null)} width="max-w-2xl">
        {detail && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Tipo</dt>
              <dd>{PERSON_TYPE[detail.person.type]}</dd>
              <dt className="text-slate-500">Documento</dt>
              <dd className="font-mono">
                {detail.person.documentType} {detail.person.document}
              </dd>
              <dt className="text-slate-500">Carnet</dt>
              <dd className="font-mono">{detail.person.cardCode ?? "—"}</dd>
              <dt className="text-slate-500">Programa</dt>
              <dd>{detail.person.program ?? "—"}</dd>
              <dt className="text-slate-500">Contacto</dt>
              <dd>{[detail.person.email, detail.person.phone].filter(Boolean).join(" · ") || "—"}</dd>
            </dl>
            <div>
              <p className="eyebrow">Préstamos</p>
              {detail.loans.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Sin préstamos registrados.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
                  {detail.loans.map((p) => (
                    <li key={p.id} className="card-sm px-3 py-2 text-sm flex items-center justify-between gap-3">
                      <span>
                        <span className="font-semibold text-blue-900">{p.item.name}</span>
                        <span className="block text-xs text-slate-500">
                          {formatDate(p.deliveredAt)} {p.returnedAt ? `→ devuelto ${formatDate(p.returnedAt)}` : ""}
                        </span>
                      </span>
                      {p.returnedAt ? <span className="pill bg-slate-100 text-slate-500">Devuelto</span> : <span className={`pill ${p.overdue ? "bg-red-100 text-red-700" : "bg-gold-100 text-gold-700"}`}>{p.overdue ? "Vencido" : "Prestado"}</span>}
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
