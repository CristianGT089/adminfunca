"use client";

import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field, ITEM_STATUS, Modal, StatusPill, Empty } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import type { PublicItem } from "@/lib/modules/inventory/service";
import { ITEM_STATUSES, CAMPUSES } from "@/lib/modules/inventory/schemas";

type Form = {
  code: string;
  name: string;
  category: string;
  description: string;
  brand: string;
  serial: string;
  location: string;
  campus: string;
  status: string;
  notes: string;
};

const empty: Form = { code: "", name: "", category: "", description: "", brand: "", serial: "", location: "", campus: "", status: "AVAILABLE", notes: "" };

export default function ItemsPage() {
  const { can } = useSession();
  const [items, setItems] = useState<PublicItem[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<PublicItem | "new" | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await request<{ items: PublicItem[] }>(`/api/inventory/items?q=${encodeURIComponent(q)}&status=${status}`);
    if (ok) setItems(data.items);
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function open(e: PublicItem | "new") {
    setError(null);
    setEditing(e);
    setForm(
      e === "new"
        ? empty
        : {
            code: e.code,
            name: e.name,
            category: e.category ?? "",
            description: e.description ?? "",
            brand: e.brand ?? "",
            serial: e.serial ?? "",
            location: e.location ?? "",
            campus: e.campus ?? "",
            status: e.status,
            notes: e.notes ?? "",
          }
    );
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const url = editing === "new" ? "/api/inventory/items" : `/api/inventory/items/${(editing as PublicItem).id}`;
    const { ok, data } = await request(url, { method: editing === "new" ? "POST" : "PATCH", json: form });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo guardar");
    setEditing(null);
    load();
  }

  const field = (k: keyof Form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }) });
  const manages = can("inventory.items.manage");

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Elementos"
        text="Cada elemento tiene un código único: es lo que va impreso en su etiqueta de código de barras."
        action={
          manages && (
            <button type="button" onClick={() => open("new")} className="btn-cta">
              Nuevo elemento
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <input className="field max-w-sm" placeholder="Buscar por nombre, código, serial o ubicación" value={q} onChange={(e) => setQ(e.target.value)} />
        <Selector className="w-48" aria-label="Filtrar por estado" value={status} onChange={setStatus} empty="Todos los estados" searchable={false} options={ITEM_STATUSES.map((s) => ({ value: s, label: ITEM_STATUS[s].text }))} />
      </div>

      {items === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : items.length === 0 ? (
        <Empty>No hay elementos{q ? " que coincidan con la búsqueda" : ""}.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Elemento</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td data-t="Código" className="font-mono text-xs text-slate-600">{e.code}</td>
                  <td>
                    <span className="font-semibold text-blue-900">{e.name}</span>
                    <span className="block text-xs text-slate-500">{[e.category, e.brand, e.serial && `S/N ${e.serial}`].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td data-t="Ubicación" className="text-slate-600">{[e.campus, e.location].filter(Boolean).join(" · ") || "—"}</td>
                  <td data-t="Estado">
                    <StatusPill status={e.status} />
                    {e.openLoan && <span className="block mt-1 text-xs text-slate-500">a {e.openLoan.person.fullName}</span>}
                  </td>
                  <td className="text-right">
                    {manages && (
                      <button type="button" onClick={() => open(e)} className="btn-soft px-3 py-1 text-xs">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={editing === "new" ? "Nuevo elemento" : "Editar elemento"} open={!!editing} onClose={() => setEditing(null)} width="max-w-2xl">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Código (etiqueta)" help="Lo que lee el escáner. Se guarda en mayúsculas, sin espacios ni guiones.">
            <input className="field font-mono" required {...field("code")} autoFocus />
          </Field>
          <Field label="Nombre">
            <input className="field" required {...field("name")} />
          </Field>
          <Field label="Categoría">
            <input className="field" list="categories" {...field("category")} />
            <datalist id="categories">
              {Array.from(new Set((items ?? []).map((e) => e.category).filter(Boolean))).map((c) => (
                <option key={c!} value={c!} />
              ))}
            </datalist>
          </Field>
          <Field label="Marca">
            <input className="field" {...field("brand")} />
          </Field>
          <Field label="Serial">
            <input className="field font-mono" {...field("serial")} />
          </Field>
          <Field label="Sede">
            <Selector value={form.campus} onChange={(v) => setForm({ ...form, campus: v })} empty="Sin sede" searchable={false} options={CAMPUSES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Ubicación" help="Salón, oficina, estante…">
            <input className="field" {...field("location")} />
          </Field>
          <Field label="Estado" help={editing !== "new" && (editing as PublicItem)?.status === "LOANED" ? "Está prestado: el estado cambia al registrar la devolución." : undefined}>
            <Selector
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              searchable={false}
              disabled={editing !== "new" && (editing as PublicItem)?.status === "LOANED"}
              options={ITEM_STATUSES.map((s) => ({ value: s, label: ITEM_STATUS[s].text, disabled: s === "LOANED" }))}
            />
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <textarea className="field" rows={2} {...field("description")} />
          </Field>
          <Field label="Observaciones" className="sm:col-span-2">
            <textarea className="field" rows={2} {...field("notes")} />
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
    </>
  );
}
