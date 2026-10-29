"use client";

import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, CopyButton, Modal, Empty, formatDate } from "@/components/core/ui";
import RequestForm, { requestBody } from "@/components/psychology/RequestForm";
import RequestDetail, { RequestPill, appointmentText } from "@/components/psychology/RequestDetail";
import type { PublicRequest } from "@/lib/modules/psychology/service";
import { REQUEST_STATUS, REQUEST_STATUSES, REQUESTER_TYPE_NAME, ORIGIN_NAME, OPEN_STATUSES, type RequestStatus } from "@/lib/modules/psychology/schemas";

type Summary = { count: Partial<Record<RequestStatus, number>>; mine: number; withoutFeedback: number };
type Tab = "inbox" | "mine" | "ongoing" | "all";

/**
 * Psychology. Psychologists take cases from the inbox, schedule the appointment and record the
 * feedback. Assistants and coordinations register requests and see how each one is going.
 */
export default function PsychologyPage() {
  const { session, can } = useSession();
  const professional = can("psychology.attend");
  const [tab, setTab] = useState<Tab | null>(null);
  const [requests, setRequests] = useState<PublicRequest[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState("");

  // Initial tab according to the role; ?request=<id> opens the detail directly (from My schedule).
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      setTab((p) => p ?? (professional ? "inbox" : "ongoing"));
      setLink(`${window.location.origin}/solicitar-cita`);
      const id = new URLSearchParams(window.location.search).get("request");
      if (id) setOpenId(id);
    }, 0);
    return () => clearTimeout(t);
  }, [session, professional]);

  const load = useCallback(() => {
    if (!tab) return;
    const p = new URLSearchParams();
    if (tab === "inbox") p.set("status", "PENDING");
    if (tab === "mine") {
      p.set("mine", "1");
      p.set("open", "1");
    }
    if (tab === "ongoing") p.set("open", "1");
    if (tab === "all" && status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    return request<{ requests: PublicRequest[]; summary: Summary }>(`/api/psychology/requests?${p}`).then(({ ok, data }) => {
      if (!ok) return;
      setRequests(data.requests);
      setSummary(data.summary);
    });
  }, [tab, status, q]);

  useEffect(() => {
    const t = setTimeout(() => load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const notify = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 4000);
    load();
  };

  if (!session || !tab) return null;

  const c = summary?.count ?? {};
  const tabs: { id: Tab; text: string; n?: number }[] = professional
    ? [
        { id: "inbox", text: "Sin asignar", n: c.PENDING },
        { id: "mine", text: "Mis casos", n: summary?.mine },
        { id: "all", text: "Todas" },
      ]
    : [
        { id: "ongoing", text: "En curso", n: (c.PENDING_VERIFICATION ?? 0) + (c.PENDING ?? 0) + (c.TAKEN ?? 0) + (c.SCHEDULED ?? 0) },
        { id: "all", text: "Todas" },
      ];

  return (
    <>
      <PageHeader
        eyebrow="Bienestar"
        title="Psicología"
        text={
          professional
            ? "Tome los casos de la bandeja, comuníquese con la persona y programe la cita. Después de la hora, registre la retroalimentación."
            : "Registre solicitudes de cita y vea en qué va cada una. Los datos de la consulta solo los ven las psicólogas."
        }
        action={
          can("psychology.request") && (
            <button type="button" onClick={() => setCreating(true)} className="btn-cta">
              Registrar solicitud
            </button>
          )
        }
      />

      {message && <Alert type="ok">{message}</Alert>}
      {professional && summary && summary.withoutFeedback > 0 && (
        <Alert type="info">
          Tiene {summary.withoutFeedback} cita{summary.withoutFeedback === 1 ? "" : "s"} que ya pasaron sin retroalimentación. Están en «Mis casos».
        </Alert>
      )}

      <section className="card-sm flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900">Enlace para que estudiantes y personal de planta pidan su cita</p>
          <p className="truncate font-mono text-xs text-slate-500">{link}</p>
        </div>
        <div className="flex gap-2">
          <CopyButton text={link} />
          <a href="/solicitar-cita" target="_blank" className="btn-soft px-3 py-1 text-xs">
            Abrir
          </a>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-full border border-blue-200 bg-white p-0.5 w-fit" role="tablist">
          {tabs.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} onClick={() => setTab(p.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === p.id ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"}`}>
              {p.text}
              {p.n ? <span className={`ml-1.5 rounded-full px-1.5 ${tab === p.id ? "bg-white/20" : "bg-gold-100 text-gold-700"}`}>{p.n}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "all" && (
            <select className="field w-44 py-1.5" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as RequestStatus | "")}>
              <option value="">Todos los estados</option>
              {REQUEST_STATUSES.map((e) => (
                <option key={e} value={e}>
                  {REQUEST_STATUS[e].text}
                </option>
              ))}
            </select>
          )}
          <input className="field w-56 py-1.5" type="search" placeholder="Nombre, documento o #número" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {requests === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : requests.length === 0 ? (
        <Empty>{tab === "inbox" ? "No hay solicitudes esperando. 🎉" : tab === "mine" ? "No tiene casos en curso." : "No hay solicitudes con ese filtro."}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Estado</th>
                <th>Psicóloga</th>
                <th>Cita</th>
                <th>Recibida</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const withoutFeedback = r.status === "SCHEDULED" && r.appointment && new Date(r.appointment.startsAt) <= new Date();
                return (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td>
                      <span className="font-semibold text-blue-900">
                        #{r.number} · {r.fullName}
                      </span>
                      <span className="block text-xs text-slate-500">{[REQUESTER_TYPE_NAME[r.requesterType as keyof typeof REQUESTER_TYPE_NAME], r.program, r.campus].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td data-t="Estado">
                      <RequestPill status={r.status} />
                      {withoutFeedback && r.isMine && <span className="ml-1 pill bg-red-100 text-red-700">falta retro</span>}
                      {OPEN_STATUSES.includes(r.status) && !!r.detail?.otherOpenRequests.length && (
                        <span className="ml-1 pill bg-gold-100 text-gold-700" title={`Hay otra solicitud abierta con este documento (${r.detail.otherOpenRequests.map((n) => `#${n}`).join(", ")})`}>
                          documento repetido
                        </span>
                      )}
                    </td>
                    <td data-t="Psicóloga" className="text-slate-600">
                      {r.assignedTo?.name ?? "—"}
                    </td>
                    <td data-t="Cita" className="text-slate-600">
                      {r.appointment ? appointmentText(r.appointment) : "—"}
                    </td>
                    <td data-t="Recibida" className="text-xs text-slate-500">
                      {formatDate(r.createdAt)}
                      <span className="block">{ORIGIN_NAME[r.origin]}</span>
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn-soft px-3 py-1 text-xs">
                        {professional && r.status === "PENDING" ? "Ver y tomar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RequestDetail id={openId} onClose={() => setOpenId(null)} onChange={notify} />

      <Modal title="Registrar solicitud de cita" open={creating} onClose={() => setCreating(false)} width="max-w-2xl">
        {creating && (
          <RequestForm
            isPublic={false}
            onCancel={() => setCreating(false)}
            onSubmit={async (d) => {
              const { ok, data } = await request<{ request: PublicRequest }>("/api/psychology/requests", { method: "POST", json: requestBody(d) });
              if (!ok) return data.error ?? "No se pudo registrar";
              setCreating(false);
              notify(`Solicitud #${data.request.number} registrada. Ya está en la bandeja de Psicología.`);
              return null;
            }}
          />
        )}
      </Modal>
    </>
  );
}
