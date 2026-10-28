"use client";

import { useCallback, useEffect, useState } from "react";
import { request } from "@/components/core/useSession";
import { PageHeader, formatDate, Empty } from "@/components/core/ui";

type Log = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; username: string } | null;
};

const FILTERS = [
  ["", "Todo"],
  ["auth.", "Accesos"],
  ["inventory.", "Entregas y devoluciones"],
  ["people.", "Personas"],
  ["items.", "Elementos"],
  ["users.", "Usuarios"],
  ["schedule.", "Agenda"],
  ["teachers.", "Docentes"],
  ["modules.", "Módulos"],
  ["psychology.", "Psicología"],
  ["payroll.", "Nómina"],
  ["projection.", "Proyección"],
] as const;

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [action, setAction] = useState("");

  const load = useCallback(
    () =>
      request<{ logs: Log[] }>(`/api/audit?action=${action}&limit=300`).then(({ ok, data }) => {
        if (ok) setLogs(data.logs);
      }),
    [action]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader eyebrow="Administración" title="Auditoría" text="Bitácora de accesos y cambios. No se puede editar ni borrar desde la plataforma." />
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([v, t]) => (
          <button key={v} type="button" onClick={() => setAction(v)} className={`btn px-4 py-2 ${action === v ? "bg-blue-800 text-white" : "bg-white text-blue-800 border border-blue-200 hover:bg-blue-50"}`}>
            {t}
          </button>
        ))}
      </div>
      {logs === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : logs.length === 0 ? (
        <Empty>Sin registros.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Quién</th>
                <th>Acción</th>
                <th>Detalle</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-slate-600">{formatDate(r.createdAt)}</td>
                  <td data-t="Quién">{r.user ? r.user.name : <span className="text-slate-400">—</span>}</td>
                  <td data-t="Acción" className="font-mono text-xs">
                    <span className={r.action.includes("Failed") ? "text-red-600" : "text-blue-900"}>{r.action}</span>
                    {r.entity && (
                      <span className="block text-slate-400">
                        {r.entity} {r.entityId?.slice(-6)}
                      </span>
                    )}
                  </td>
                  <td data-t="Detalle" className="font-mono text-[11px] text-slate-500 max-w-xs truncate">{r.details ? JSON.stringify(r.details) : ""}</td>
                  <td data-t="IP" className="font-mono text-xs text-slate-400">{r.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
