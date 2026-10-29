"use client";

import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, Field, Modal } from "@/components/core/ui";
import { formatHours, formatTime } from "@/components/schedule/dates";
import type { PublicPayrollItem } from "@/lib/modules/payroll/service";
import type { PublicEvent } from "@/lib/modules/schedule/service";
import { EVENT_TYPE_COLOR, COMPLETION_NAME, EVENT_TYPE_NAME, TYPES_REQUIRING_CLOSING } from "@/lib/modules/schedule/schemas";
import { PAYROLL_ITEM_STATUS, type PeriodStatus } from "@/lib/modules/payroll/schemas";
import { formatCop } from "./format";

type Detail = { item: PublicPayrollItem; events: (PublicEvent & { counts: boolean; appliedRate: number | null; subtotal: number })[]; changedSinceVerification: boolean };

type Month = { year: number; month: number };

/** Review of a person in the month. `id` is the person's id (their line in the month). */
export default function PersonDetail({ id, month, periodStatus, onClose, onChange }: { id: string | null; month: Month; periodStatus: PeriodStatus; onClose: () => void; onChange: () => Promise<unknown> | void }) {
  return (
    <Modal title="Revisión de la persona" open={!!id} onClose={onClose} width="max-w-4xl">
      {id && <Content key={`${month.year}-${month.month}-${id}`} url={`/api/payroll/people/${id}?year=${month.year}&month=${month.month}`} periodStatus={periodStatus} onChange={onChange} />}
    </Modal>
  );
}

function Content({ url, periodStatus, onChange }: { url: string; periodStatus: PeriodStatus; onChange: () => Promise<unknown> | void }) {
  const { can } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"flag" | "pay" | null>(null);
  const [text, setText] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState("");

  const load = useCallback(
    () =>
      request<Detail>(url).then(({ ok, data }) => {
        if (!ok) return setError(data.error ?? "No se pudo cargar");
        setD(data);
        setRate(data.item.person.baseHourlyRate?.toString() ?? "");
      }),
    [url]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function action(body: Record<string, unknown>) {
    setError(null);
    const { ok, data } = await request<Detail>(url, { method: "POST", json: body });
    if (!ok) return setError(data.error ?? "No se pudo guardar");
    setD(data);
    setPanel(null);
    setText("");
    onChange();
  }

  async function saveRate() {
    if (!d) return;
    setError(null);
    const { ok, data } = await request("/api/payroll/rate", { method: "PATCH", json: { personId: d.item.person.id, hourlyRate: rate === "" ? null : Number(rate) } });
    if (!ok) return setError(data.error ?? "No se pudo guardar la tarifa");
    // Reads recalculate the people who are not verified yet, so the new rate shows on reload.
    await onChange();
    load();
  }

  if (!d) return error ? <Alert>{error}</Alert> : <p className="text-sm text-slate-400">Cargando...</p>;
  const { item } = d;
  const manages = can("payroll.manage");
  const inReview = periodStatus === "OPEN" || periodStatus === "IN_REVIEW";
  const editable = manages && inReview && (item.status === "PENDING" || item.status === "FLAGGED");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-heading text-lg font-bold text-blue-900">{item.person.fullName}</span>
        <span className={`pill ${PAYROLL_ITEM_STATUS[item.status].className}`}>{PAYROLL_ITEM_STATUS[item.status].text}</span>
        <span className="text-sm text-slate-500">
          {formatHours(item.hours)} · <strong className="text-blue-900">{formatCop(item.amount)}</strong>
        </span>
      </div>

      {d.changedSinceVerification && <Alert type="info">La agenda cambió después de verificar a esta persona. Reabra su revisión para tomar los valores nuevos.</Alert>}
      {item.observation && <Alert>Observación: {item.observation}</Alert>}
      {item.paidAt && (
        <Alert type="ok">
          Pagado el {new Date(item.paidAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          {item.paymentReference && ` · referencia ${item.paymentReference}`}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <section>
          <p className="field-label">Requisitos ({item.review.met} de {item.review.total})</p>
          <ul className="flex flex-col gap-1.5">
            {item.review.list.map((r) => (
              <li key={r.key}>
                <label className={`flex items-center gap-2 text-sm ${r.auto || !editable ? "" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={r.ok}
                    disabled={r.auto || !editable}
                    onChange={(e) => action({ action: "requirements", requirements: { [r.key]: e.target.checked } })}
                  />
                  <span className={r.ok ? "text-slate-700" : "text-red-700"}>{r.text}</span>
                  {r.auto && <span className="text-[10px] uppercase tracking-wider text-slate-400">automático</span>}
                </label>
              </li>
            ))}
          </ul>
          {item.calculation.withoutRate > 0 && <p className="mt-2 text-xs text-red-700">{item.calculation.withoutRate} registro(s) sin valor por hora: ponga un valor base o edite el registro en la agenda.</p>}
          {item.calculation.withoutClosing > 0 && <p className="mt-1 text-xs text-red-700">{item.calculation.withoutClosing} práctica(s) o consulta(s) ya pasaron sin cierre.</p>}
        </section>
        <section className="rounded-2xl bg-blue-50 p-4">
          <Field label="Valor base de la hora" help="Se usa en los registros que no tienen un valor propio (los cursos siempre lo traen).">
            <div className="flex gap-2">
              <input type="number" min={0} step={500} className="field" disabled={!editable} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Sin definir" />
              {editable && rate !== (item.person.baseHourlyRate?.toString() ?? "") && (
                <button type="button" onClick={saveRate} className="btn-primary shrink-0 px-3 py-1 text-xs">
                  Guardar
                </button>
              )}
            </div>
          </Field>
        </section>
      </div>

      <div className="card-sm overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Actividad</th>
              <th>Fecha</th>
              <th className="text-right">Horas</th>
              <th className="text-right">Valor hora</th>
              <th className="text-right">Subtotal</th>
              <th>Cierre</th>
            </tr>
          </thead>
          <tbody>
            {d.events.map((e) => (
              <tr key={e.id} className={e.counts ? "" : "opacity-50"}>
                <td>
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${EVENT_TYPE_COLOR[e.type].dot}`} />
                  <span className="font-semibold text-blue-900">{e.title}</span>
                  <span className="block text-xs text-slate-500">
                    {EVENT_TYPE_NAME[e.type]}
                    {!e.counts && " · no cuenta"}
                  </span>
                </td>
                <td data-t="Fecha" className="whitespace-nowrap text-slate-600">
                  {new Date(e.startsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })} {formatTime(e.startsAt)}
                </td>
                <td data-t="Horas" className="text-right">
                  {formatHours(e.hours)}
                </td>
                <td data-t="Valor hora" className={`text-right ${e.appliedRate == null && e.counts ? "text-red-700" : "text-slate-600"}`}>
                  {e.appliedRate == null ? "Sin valor" : formatCop(e.appliedRate)}
                  {e.hourlyRate == null && e.appliedRate != null && <span className="block text-[10px] text-slate-400">base</span>}
                </td>
                <td data-t="Subtotal" className="text-right font-semibold">
                  {formatCop(e.subtotal)}
                </td>
                <td data-t="Cierre">
                  {e.completion ? (
                    <span className={`pill ${COMPLETION_NAME[e.completion].className}`}>{COMPLETION_NAME[e.completion].text}</span>
                  ) : TYPES_REQUIRING_CLOSING.includes(e.type) && new Date(e.startsAt) <= new Date() ? (
                    <span className="pill bg-red-100 text-red-700">Falta</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <Alert>{error}</Alert>}

      {panel === "flag" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50/60 p-4">
          <Field label="¿Qué falta o qué no cuadra?">
            <textarea className="field" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </Field>
          <div className="flex gap-2">
            <button type="button" onClick={() => action({ action: "flag", observation: text })} className="btn-danger">
              Guardar observación
            </button>
            <button type="button" onClick={() => setPanel(null)} className="btn-secondary">
              Volver
            </button>
          </div>
        </div>
      )}
      {panel === "pay" && (
        <div className="grid gap-3 rounded-2xl border-2 border-gold-500/60 bg-gold-50 p-4 sm:grid-cols-2">
          <Field label="Fecha del pago">
            <input type="date" className="field" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
          <Field label="Referencia (opcional)" help="Comprobante, transferencia…">
            <input className="field" maxLength={120} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" onClick={() => action({ action: "pay", date: paymentDate, reference: text || null })} className="btn-cta">
              Registrar pago de {formatCop(item.amount)}
            </button>
            <button type="button" onClick={() => setPanel(null)} className="btn-secondary">
              Volver
            </button>
          </div>
        </div>
      )}

      {panel === null && (
        <div className="flex flex-wrap gap-2">
          {editable && (
            <button type="button" disabled={!item.review.complete} title={item.review.complete ? undefined : "Faltan requisitos"} onClick={() => action({ action: "verify" })} className="btn-cta">
              Marcar como verificado
            </button>
          )}
          {editable && (
            <button type="button" onClick={() => setPanel("flag")} className="btn-secondary">
              Dejar observación
            </button>
          )}
          {manages && inReview && item.status === "VERIFIED" && (
            <button type="button" onClick={() => action({ action: "reopen" })} className="btn-soft">
              Reabrir revisión
            </button>
          )}
          {can("payroll.pay") && periodStatus === "APPROVED" && item.status === "VERIFIED" && (
            <button type="button" onClick={() => setPanel("pay")} className="btn-cta">
              Registrar pago
            </button>
          )}
        </div>
      )}
    </div>
  );
}
