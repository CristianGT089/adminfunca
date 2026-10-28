"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "@/components/core/useSession";
import { Alert, PageHeader, Field, formatDate, Modal, PERSON_TYPE, ITEM_STATUS, Empty } from "@/components/core/ui";
import ReturnModal from "@/components/inventory/ReturnModal";
import IssueModal, { IssueList } from "@/components/inventory/IssueModal";
import type { PublicItem, PublicPerson, PublicLoan } from "@/lib/modules/inventory/service";

type SearchResult = { type: "person"; person: PublicPerson } | { type: "item"; item: PublicItem } | { type: null };

/** Spanish label of an item status, in lower case (e.g. "mantenimiento"). */
const statusText = (status: string) => (ITEM_STATUS[status]?.text ?? status).toLowerCase();

/**
 * Inventory desk, designed for the barcode reader (which types like a keyboard and ends
 * with Enter): a single field receives the ID card or the label, in any order. With person
 * and item on screen, the loan is confirmed. If an item that is already loaned is scanned,
 * registering its return is offered.
 */
export default function InventoryDeskPage() {
  const [code, setCode] = useState("");
  const [person, setPerson] = useState<PublicPerson | null>(null);
  const [item, setItem] = useState<PublicItem | null>(null);
  const [notes, setNotes] = useState("");
  const [deliveredAt, setDeliveredAt] = useState("");
  const [issue, setIssue] = useState<PublicLoan | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "ok" | "info"; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [openLoans, setOpenLoans] = useState<PublicLoan[]>([]);
  const [returning, setReturning] = useState<PublicLoan | null>(null);
  const [manualSearch, setManualSearch] = useState<"person" | "item" | null>(null);
  const scannerRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const focusScanner = useCallback(() => setTimeout(() => scannerRef.current?.focus(), 50), []);

  const loadOpenLoans = useCallback(
    () =>
      request<{ loans: PublicLoan[] }>("/api/inventory/loans?status=open&limit=100").then(({ ok, data }) => {
        if (ok) setOpenLoans(data.loans);
      }),
    []
  );

  useEffect(() => {
    loadOpenLoans();
    focusScanner();
  }, [loadOpenLoans, focusScanner]);

  // With person and item ready, focus moves to the confirm button: the reader's Enter confirms.
  useEffect(() => {
    if (person && item) confirmRef.current?.focus();
  }, [person, item]);

  async function scan(value: string) {
    const read = value.trim();
    if (!read) return;
    setSearching(true);
    setMessage(null);
    const { ok, data } = await request<SearchResult>("/api/inventory/search", { method: "POST", json: { code: read } });
    setSearching(false);
    setCode("");
    if (!ok || data.type === null) {
      setMessage({ type: "error", text: `No hay ninguna persona ni elemento con el código "${read}".` });
      focusScanner();
      return;
    }
    if (data.type === "person") {
      setPerson(data.person);
      if (!item) setMessage({ type: "info", text: `Persona identificada: ${data.person.fullName}. Lea el elemento.` });
    } else {
      const it = data.item;
      if (it.openLoan) {
        const p = openLoans.find((a) => a.id === it.openLoan?.id);
        setMessage({ type: "info", text: `${it.name} está prestado a ${it.openLoan.person.fullName}.` });
        if (p) setReturning(p);
        focusScanner();
        return;
      }
      if (it.status !== "AVAILABLE") {
        setMessage({ type: "error", text: `${it.name} no está disponible (${statusText(it.status)}).` });
        focusScanner();
        return;
      }
      setItem(it);
      if (!person) setMessage({ type: "info", text: `Elemento identificado: ${it.name}. Lea el carnet de quien lo recibe.` });
    }
    if (!(data.type === "person" ? item : person)) focusScanner();
  }

  async function confirmLoan() {
    if (!person || !item) return;
    setSearching(true);
    const { ok, data } = await request<{ loan: PublicLoan }>("/api/inventory/loans", {
      method: "POST",
      json: { personId: person.id, itemId: item.id, notes: notes || null, deliveredAt: new Date(deliveredAt || localNow()).toISOString() },
    });
    setSearching(false);
    if (!ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo registrar la entrega" });
      return;
    }
    setMessage({ type: "ok", text: `Entregado: ${item.name} a ${person.fullName}.` });
    clear();
    loadOpenLoans();
  }

  function clear() {
    setPerson(null);
    setItem(null);
    setNotes("");
    setDeliveredAt("");
    focusScanner();
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Entregar / recibir"
        text="Lea el carnet de la persona y la etiqueta del elemento, en cualquier orden. También puede escribir el documento o el código y presionar Enter."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="flex flex-col gap-5">
          <div className="card p-5 sm:p-6">
            <label htmlFor="scanner" className="field-label">
              Lector de código de barras
            </label>
            <input
              id="scanner"
              ref={scannerRef}
              className="field-scanner"
              placeholder="Código de carnet o de elemento"
              value={code}
              autoComplete="off"
              disabled={searching}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  scan(code);
                }
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Búsqueda manual:</span>
              <button type="button" className="btn-soft px-3 py-1 text-xs" onClick={() => setManualSearch("person")}>
                Buscar persona
              </button>
              <button type="button" className="btn-soft px-3 py-1 text-xs" onClick={() => setManualSearch("item")}>
                Buscar elemento
              </button>
            </div>
            {message && (
              <div className="mt-4">
                <Alert type={message.type}>{message.text}</Alert>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SlotCard title="Quien recibe" step={1} filled={!!person} onRemove={person ? () => setPerson(null) : undefined}>
              {person ? (
                <>
                  <p className="font-heading text-lg font-bold text-blue-900">{person.fullName}</p>
                  <p className="text-sm text-slate-500">
                    {PERSON_TYPE[person.type]} · {person.documentType} {person.document}
                  </p>
                  {person.program && <p className="text-sm text-slate-500">{person.program}</p>}
                  {!!person.openLoans && (
                    <p className="mt-2 pill bg-gold-100 text-gold-700">
                      Tiene {person.openLoans} elemento{person.openLoans === 1 ? "" : "s"} sin devolver
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">Lea el carnet o busque por nombre.</p>
              )}
            </SlotCard>
            <SlotCard title="Elemento" step={2} filled={!!item} onRemove={item ? () => setItem(null) : undefined}>
              {item ? (
                <>
                  <p className="font-heading text-lg font-bold text-blue-900">{item.name}</p>
                  <p className="font-mono text-sm text-slate-500">{item.code}</p>
                  <p className="text-sm text-slate-500">{[item.category, item.brand, item.serial && `S/N ${item.serial}`, item.location].filter(Boolean).join(" · ")}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Lea la etiqueta o busque por nombre o código.</p>
              )}
            </SlotCard>
          </div>

          {person && item && (
            <div className="card p-5 sm:p-6 border-gold-500 flex flex-col gap-4">
              <p className="eyebrow">Paso 3 · Confirmar entrega</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha y hora de entrega" help="Fecha y hora actuales. Modifíquela solo si la entrega ocurrió antes.">
                  <input type="datetime-local" className="field" value={deliveredAt || localNow()} onChange={(e) => setDeliveredAt(e.target.value)} />
                </Field>
                <Field label="Observaciones (opcional)">
                  <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo o destino del elemento" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <button ref={confirmRef} type="button" onClick={confirmLoan} disabled={searching} className="btn-cta">
                  Confirmar entrega
                </button>
                <button type="button" onClick={clear} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold text-blue-900">Sin devolver ({openLoans.length})</h2>
            <Link href="/panel/inventario/historial" className="text-xs font-semibold text-blue-800 hover:underline">
              Ver historial
            </Link>
          </div>
          {openLoans.length === 0 ? (
            <Empty>No hay elementos prestados.</Empty>
          ) : (
            <ul className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
              {openLoans.map((p) => (
                <li key={p.id} className={`card-sm p-3 flex items-center justify-between gap-3 ${p.overdue ? "border-red-300 bg-red-50/40" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-blue-900 text-sm">{p.item.name}</p>
                    <p className="truncate text-xs text-slate-500">{p.person.fullName}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(p.deliveredAt)}
                      {p.overdue && <span className="ml-2 text-red-600 font-semibold">Vencido</span>}
                    </p>
                    <IssueList issues={p.issues} />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" onClick={() => setReturning(p)} className="btn-soft px-3 py-1.5 text-xs">
                      Recibir
                    </button>
                    <button type="button" onClick={() => setIssue(p)} className="btn px-3 py-1 text-xs text-orange-700 hover:bg-orange-50">
                      Novedad
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <ReturnModal
        loan={returning}
        onClose={() => {
          setReturning(null);
          focusScanner();
        }}
        onDone={(text) => {
          setReturning(null);
          setMessage({ type: "ok", text });
          loadOpenLoans();
          focusScanner();
        }}
      />

      <IssueModal
        loan={issue}
        onClose={() => {
          setIssue(null);
          focusScanner();
        }}
        onDone={(text) => {
          setIssue(null);
          setMessage({ type: "info", text });
          loadOpenLoans();
          focusScanner();
        }}
      />

      <SearchModal
        type={manualSearch}
        onClose={() => {
          setManualSearch(null);
          focusScanner();
        }}
        onPerson={(p) => {
          setPerson(p);
          setManualSearch(null);
          if (!item) focusScanner();
        }}
        onItem={(e) => {
          if (e.openLoan) {
            const p = openLoans.find((a) => a.id === e.openLoan?.id);
            if (p) setReturning(p);
          } else setItem(e);
          setManualSearch(null);
          if (!person) focusScanner();
        }}
      />
    </>
  );
}

/** Local date and time in the format a datetime-local input expects. */
function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function SlotCard({ title, step, filled, onRemove, children }: { title: string; step: number; filled: boolean; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <div className={`card p-5 transition-colors ${filled ? "border-blue-400" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-800">
          <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${filled ? "bg-gold-500 text-blue-950" : "bg-blue-100 text-blue-800"}`}>{filled ? "✓" : step}</span>
          {title}
        </p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-slate-400 hover:text-red-600">
            Quitar
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

type SearchProps = { type: "person" | "item" | null; onClose: () => void; onPerson: (p: PublicPerson) => void; onItem: (e: PublicItem) => void };

function SearchModal(props: SearchProps) {
  return (
    <Modal title={props.type === "person" ? "Buscar persona" : "Buscar elemento"} open={!!props.type} onClose={props.onClose}>
      {/* `key` resets the search every time the type changes. */}
      {props.type && <Search key={props.type} {...props} type={props.type} />}
    </Modal>
  );
}

function Search({ type, onPerson, onItem }: SearchProps & { type: "person" | "item" }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [items, setItems] = useState<PublicItem[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (type === "person") {
        const { ok, data } = await request<{ people: PublicPerson[] }>(`/api/inventory/people?q=${encodeURIComponent(q)}`);
        if (ok) setPeople(data.people);
      } else {
        const { ok, data } = await request<{ items: PublicItem[] }>(`/api/inventory/items?q=${encodeURIComponent(q)}&limit=40`);
        if (ok) setItems(data.items);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, type]);

  return (
    <>
      <input className="field mb-3" placeholder={type === "person" ? "Nombre, apellido, documento o programa" : "Nombre, código, serial o ubicación"} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="flex flex-col gap-1 max-h-80 overflow-y-auto">
        {type === "person" &&
          people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPerson(p)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-blue-50">
                <span className="block font-semibold text-blue-900">{p.fullName}</span>
                <span className="block text-xs text-slate-500">
                  {PERSON_TYPE[p.type]} · {p.documentType} {p.document}
                  {p.program ? ` · ${p.program}` : ""}
                </span>
              </button>
            </li>
          ))}
        {type === "item" &&
          items.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onItem(e)} disabled={e.status === "RETIRED" || e.status === "MAINTENANCE"} className="w-full rounded-xl px-3 py-2 text-left hover:bg-blue-50 disabled:opacity-50">
                <span className="block font-semibold text-blue-900">{e.name}</span>
                <span className="block text-xs text-slate-500">
                  <span className="font-mono">{e.code}</span> · {e.status === "LOANED" ? `prestado a ${e.openLoan?.person.fullName}` : statusText(e.status)}
                </span>
              </button>
            </li>
          ))}
        {((type === "person" && people.length === 0) || (type === "item" && items.length === 0)) && <li className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados</li>}
      </ul>
    </>
  );
}
