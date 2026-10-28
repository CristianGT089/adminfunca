"use client";

import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { PageHeader, formatDate, Empty, PERSON_TYPE } from "@/components/core/ui";
import type { PublicLoan } from "@/lib/modules/inventory/service";
import ReturnModal from "@/components/inventory/ReturnModal";
import IssueModal, { IssueList, ISSUE_TYPE_NAME } from "@/components/inventory/IssueModal";

// Spanish labels of the return condition (the enum values are in English).
const RETURN_CONDITION_NAME: Record<string, string> = { GOOD: "Bueno", DAMAGED: "Dañado", INCOMPLETE: "Incompleto" };

export default function HistoryPage() {
  const { can } = useSession();
  const [loans, setLoans] = useState<PublicLoan[] | null>(null);
  const [status, setStatus] = useState<"open" | "closed" | "">("");
  const [q, setQ] = useState("");
  const [returning, setReturning] = useState<PublicLoan | null>(null);
  const [issue, setIssue] = useState<PublicLoan | null>(null);

  const load = useCallback(
    () =>
      request<{ loans: PublicLoan[] }>(`/api/inventory/loans?status=${status}&limit=300`).then(({ ok, data }) => {
        if (ok) setLoans(data.loans);
      }),
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  const filter = q.trim().toLowerCase();
  const visible = (loans ?? []).filter(
    (p) => !filter || p.item.name.toLowerCase().includes(filter) || p.item.code.toLowerCase().includes(filter) || p.person.fullName.toLowerCase().includes(filter)
  );

  function exportCsv() {
    const rows = [
      ["Elemento", "Código", "Persona", "Tipo", "Entregado", "Registró", "Devuelto", "Recibió", "Estado devolución", "Novedades", "Observaciones"],
      ...visible.map((p) => [
        p.item.name, p.item.code, p.person.fullName, PERSON_TYPE[p.person.type] ?? p.person.type, formatDate(p.deliveredAt), p.registeredBy.name,
        formatDate(p.returnedAt), p.returnedBy?.name ?? "", p.returnCondition ? RETURN_CONDITION_NAME[p.returnCondition] : "",
        p.issues.map((n) => `${ISSUE_TYPE_NAME[n.type] ?? n.type} (${n.minutesSinceDelivery} min): ${n.description}`).join(" | "), p.notes ?? "",
      ]),
    ];
    // Leading = + - @ would run as a formula in Excel (CSV injection): prefix with an apostrophe.
    const cell = (c: unknown) => {
      const s = String(c);
      return `"${(typeof c === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const csv = rows.map((r) => r.map(cell).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `prestamos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Historial de préstamos"
        text="Todas las entregas y devoluciones, con quién las registró."
        action={
          can("inventory.reports") && (
            <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="btn-secondary">
              Exportar CSV
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <input className="field max-w-sm" placeholder="Filtrar por elemento, código o persona" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {(
            [
              ["", "Todos"],
              ["open", "Sin devolver"],
              ["closed", "Devueltos"],
            ] as const
          ).map(([v, t]) => (
            <button key={v} type="button" onClick={() => setStatus(v)} className={`btn px-4 py-2 ${status === v ? "bg-blue-800 text-white" : "bg-white text-blue-800 border border-blue-200 hover:bg-blue-50"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {loans === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : visible.length === 0 ? (
        <Empty>No hay préstamos para mostrar.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Elemento</th>
                <th>Persona</th>
                <th>Entregado</th>
                <th>Devuelto</th>
                <th>Estado</th>
                <th>Novedades</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="font-semibold text-blue-900">{p.item.name}</span>
                    <span className="block font-mono text-xs text-slate-400">{p.item.code}</span>
                  </td>
                  <td data-t="Persona">
                    {p.person.fullName}
                    <span className="block text-xs text-slate-400">{p.person.program ?? ""}</span>
                  </td>
                  <td data-t="Entregado" className="text-slate-600">
                    {formatDate(p.deliveredAt)}
                    <span className="block text-xs text-slate-400">por {p.registeredBy.name}</span>
                  </td>
                  <td data-t="Devuelto" className="text-slate-600">
                    {p.returnedAt ? (
                      <>
                        {formatDate(p.returnedAt)}
                        <span className="block text-xs text-slate-400">
                          por {p.returnedBy?.name}
                          {p.returnCondition && p.returnCondition !== "GOOD" ? ` · ${RETURN_CONDITION_NAME[p.returnCondition].toLowerCase()}` : ""}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-t="Estado">
                    {p.returnedAt ? (
                      <span className="pill bg-slate-100 text-slate-500">Devuelto</span>
                    ) : p.overdue ? (
                      <span className="pill bg-red-100 text-red-700">Vencido</span>
                    ) : (
                      <span className="pill bg-gold-100 text-gold-700">Prestado</span>
                    )}
                  </td>
                  <td data-t="Novedades" className="max-w-xs">
                    {p.issues.length === 0 ? <span className="text-slate-300">—</span> : <IssueList issues={p.issues} />}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {can("inventory.loan") && (
                      <>
                        {!p.returnedAt && (
                          <button type="button" onClick={() => setReturning(p)} className="btn-soft px-3 py-1 text-xs mr-1">
                            Recibir
                          </button>
                        )}
                        <button type="button" onClick={() => setIssue(p)} className="btn px-3 py-1 text-xs text-orange-700 hover:bg-orange-50">
                          Novedad
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

      <IssueModal
        loan={issue}
        onClose={() => setIssue(null)}
        onDone={() => {
          setIssue(null);
          load();
        }}
      />
      <ReturnModal
        loan={returning}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null);
          load();
        }}
      />
    </>
  );
}
