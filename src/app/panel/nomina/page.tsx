"use client";

import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field, Modal, PERSON_TYPE, Empty, formatDate } from "@/components/core/ui";
import { MONTHS, formatHours } from "@/components/schedule/dates";
import PersonDetail from "@/components/payroll/PersonDetail";
import { formatCop } from "@/components/payroll/format";
import type { Payroll } from "@/lib/modules/payroll/service";
import { EVENT_TYPE_COLOR, EVENT_TYPE_NAME, EVENT_TYPES } from "@/lib/modules/schedule/schemas";
import { PAYROLL_ITEM_STATUS, PERIOD_STATUS, PERIOD_STATUSES, type PeriodStatus, type PeriodAction } from "@/lib/modules/payroll/schemas";
import { ROLE_NAME } from "@/lib/core/permissions";

const profileName = (p: string) => ROLE_NAME[p as keyof typeof ROLE_NAME] ?? PERSON_TYPE[p] ?? p;

/**
 * Hours and payroll of the month. Academic coordination sees everyone's hours (modules, courses,
 * field trips, consultations…), reviews each person's requirements and approves the month;
 * administrative coordination records the payments. At the end the report of what was paid remains.
 */
export default function PayrollPage() {
  const { can } = useSession();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [n, setN] = useState<Payroll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [payAll, setPayAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending">("all");

  const load = useCallback(
    () =>
      request<Payroll>(`/api/payroll?year=${month.year}&month=${month.month}`).then(({ ok, data }) => {
        if (!ok) return setError(data.error ?? "No se pudo cargar la nómina");
        setError(null);
        setN(data);
      }),
    [month]
  );
  useEffect(() => {
    load();
  }, [load]);

  const notify = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 4000);
    return load();
  };

  async function changePeriod(action: PeriodAction, text: string) {
    const { ok, data } = await request("/api/payroll/period", { method: "POST", json: { ...month, action } });
    if (!ok) return setError(data.error ?? "No se pudo cambiar el estado");
    notify(text);
  }

  const move = (d: number) => setMonth((m) => (m.month + d < 1 ? { year: m.year - 1, month: 12 } : m.month + d > 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + d }));

  const status = n?.period.status;
  const manages = can("payroll.manage");
  const pays = can("payroll.pay");
  const monthTypes = n ? EVENT_TYPES.filter((t) => n.totals.hoursByType[t]) : [];
  const items = n ? (filter === "pending" ? n.items.filter((i) => i.status === "PENDING" || i.status === "FLAGGED") : n.items) : [];

  // A single main action depending on the month's stage and the role.
  let action: React.ReactNode = null;
  if (n && manages && status === "OPEN")
    action = (
      <button type="button" className="btn-cta" onClick={() => changePeriod("review", "El mes pasó a revisión.")}>
        Iniciar revisión
      </button>
    );
  if (n && manages && status === "IN_REVIEW")
    action = (
      <button type="button" className="btn-cta" disabled={n.totals.byStatus.VERIFIED !== n.totals.people || n.totals.people === 0} title="Todas las personas deben estar verificadas" onClick={() => changePeriod("approve", "Mes aprobado: los valores quedaron fijos y pasa a pago.")}>
        Aprobar para pago
      </button>
    );
  if (n && pays && status === "APPROVED")
    action = (
      <button type="button" className="btn-cta" onClick={() => setPayAll(true)}>
        Registrar pagos
      </button>
    );

  return (
    <>
      <PageHeader
        eyebrow="Coordinación académica"
        title="Horas y nómina"
        text="Horas del mes por persona y tipo de actividad, tomadas de la agenda. Revise los requisitos de cada persona, apruebe el mes y lleve el registro de lo pagado."
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/payroll/report?year=${month.year}&month=${month.month}`} className="btn-secondary">
              Descargar reporte
            </a>
            {action}
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => move(-1)} aria-label="Mes anterior" className="btn-soft h-9 w-9 p-0">
          ‹
        </button>
        <h2 className="min-w-44 text-center font-heading text-lg font-bold capitalize text-blue-900">
          {MONTHS[month.month - 1]} {month.year}
        </h2>
        <button type="button" onClick={() => move(1)} aria-label="Mes siguiente" className="btn-soft h-9 w-9 p-0">
          ›
        </button>
      </div>

      {error && <Alert>{error}</Alert>}
      {message && <Alert type="ok">{message}</Alert>}

      {!n ? (
        !error && <p className="text-sm text-slate-400">Cargando...</p>
      ) : (
        <>
          <Stages status={n.period.status} period={n.period} />

          {status === "OPEN" && !n.period.monthEnded && <Alert type="info">El mes aún no termina: las horas se siguen actualizando con lo que se registre en la agenda.</Alert>}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { t: "Horas del mes", v: formatHours(n.totals.hours) },
              { t: status === "PAID" ? "Total pagado" : "Valor del mes", v: formatCop(status === "PAID" ? n.totals.paid : n.totals.amount) },
              { t: "Personas verificadas", v: `${n.totals.byStatus.VERIFIED + n.totals.byStatus.PAID} de ${n.totals.people}` },
              { t: "Con requisitos pendientes", v: String(n.totals.pendingRequirements), alert: n.totals.pendingRequirements > 0 },
            ].map((x) => (
              <div key={x.t} className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{x.t}</p>
                <p className={`mt-1 font-heading text-2xl font-extrabold ${x.alert ? "text-red-600" : "text-blue-900"}`}>{x.v}</p>
              </div>
            ))}
          </section>

          {monthTypes.length > 0 && (
            <section className="card p-5">
              <p className="field-label">Horas por tipo de actividad</p>
              <ul className="mt-2 flex flex-col gap-2">
                {monthTypes.map((t) => {
                  const h = n.totals.hoursByType[t];
                  return (
                    <li key={t} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_6rem_8rem]">
                      <span className="flex items-center gap-2 text-slate-700">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${EVENT_TYPE_COLOR[t].dot}`} />
                        {EVENT_TYPE_NAME[t]}
                      </span>
                      <span className="h-2.5 rounded-full bg-blue-50">
                        <span className={`block h-full rounded-full ${EVENT_TYPE_COLOR[t].dot}`} style={{ width: `${Math.max(2, (h / n.totals.hours) * 100)}%` }} />
                      </span>
                      <span className="text-right font-semibold text-blue-900">{formatHours(h)}</span>
                      <span className="hidden text-right text-slate-500 sm:block">{formatCop(n.totals.amountByType[t] ?? 0)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {n.items.length === 0 ? (
            <Empty>No hay actividades pagables registradas en la agenda para este mes.</Empty>
          ) : (
            <section className="flex flex-col gap-3">
              <div className="flex rounded-full border border-blue-200 bg-white p-0.5 w-fit">
                {(
                  [
                    ["all", `Todas (${n.items.length})`],
                    ["pending", `Por revisar (${n.totals.byStatus.PENDING + n.totals.byStatus.FLAGGED})`],
                  ] as const
                ).map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setFilter(v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === v ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="card overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      {monthTypes.map((t) => (
                        <th key={t} className="text-right">
                          {EVENT_TYPE_NAME[t]}
                        </th>
                      ))}
                      <th className="text-right">Total</th>
                      <th className="text-right">Valor</th>
                      <th>Requisitos</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="cursor-pointer" onClick={() => setOpened(i.id)}>
                        <td>
                          <span className="font-semibold text-blue-900">{i.person.fullName}</span>
                          <span className="block text-xs text-slate-500">{profileName(i.person.profile)}</span>
                        </td>
                        {monthTypes.map((t) => (
                          <td key={t} data-t={EVENT_TYPE_NAME[t]} className="text-right text-slate-600">
                            {i.calculation.hoursByType[t] ? formatHours(i.calculation.hoursByType[t]) : ""}
                          </td>
                        ))}
                        <td data-t="Total" className="text-right font-semibold">
                          {formatHours(i.hours)}
                        </td>
                        <td data-t="Valor" className="text-right font-semibold text-blue-900">
                          {formatCop(i.amount)}
                        </td>
                        <td data-t="Requisitos">
                          <span className={`pill ${i.review.complete ? "bg-emerald-100 text-emerald-700" : "bg-gold-100 text-gold-700"}`}>
                            {i.review.met}/{i.review.total}
                          </span>
                        </td>
                        <td data-t="Estado">
                          <span className={`pill ${PAYROLL_ITEM_STATUS[i.status].className}`}>{PAYROLL_ITEM_STATUS[i.status].text}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {manages && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {status === "IN_REVIEW" && (
                    <button type="button" onClick={() => changePeriod("reopen", "El mes volvió a registro de actividades.")} className="btn-soft px-3 py-1.5 text-xs">
                      Volver a registro de actividades
                    </button>
                  )}
                  {status === "APPROVED" && n.totals.byStatus.PAID === 0 && (
                    <button type="button" onClick={() => changePeriod("unapprove", "El mes volvió a revisión.")} className="btn-soft px-3 py-1.5 text-xs">
                      Devolver a revisión
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <PersonDetail id={opened} month={month} periodStatus={n.period.status} onClose={() => setOpened(null)} onChange={load} />
          <PayAll open={payAll} month={month} total={n.items.filter((i) => i.status === "VERIFIED").reduce((s, i) => s + i.amount, 0)} onClose={() => setPayAll(false)} onDone={(m) => { setPayAll(false); notify(m); }} />
        </>
      )}
    </>
  );
}

/** Which part of the process the month is in. */
function Stages({ status, period }: { status: PeriodStatus; period: Payroll["period"] }) {
  const current = PERIOD_STATUSES.indexOf(status);
  const dates: Partial<Record<PeriodStatus, string | null>> = { IN_REVIEW: period.inReviewAt, APPROVED: period.approvedAt, PAID: period.paidAt };
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {PERIOD_STATUSES.map((e, i) => {
        const done = i < current || (e === "PAID" && status === "PAID");
        const here = i === current && status !== "PAID";
        return (
          <li key={e} className={`rounded-2xl border p-3 ${here ? "border-gold-500 bg-gold-50" : done ? "border-emerald-200 bg-emerald-50/60" : "border-blue-200 bg-white"}`}>
            <span className="flex items-center gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${here ? "bg-gold-500 text-blue-950" : done ? "bg-emerald-600 text-white" : "bg-blue-100 text-blue-800"}`}>{done ? "✓" : i + 1}</span>
              <span className="font-heading text-sm font-bold text-blue-900">{PERIOD_STATUS[e].text}</span>
            </span>
            <span className="mt-1 block text-xs text-slate-500">{dates[e] && (done || here) ? formatDate(dates[e]!, false) : PERIOD_STATUS[e].help}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PayAll({ open, month, total, onClose, onDone }: { open: boolean; month: { year: number; month: number }; total: number; onClose: () => void; onDone: (m: string) => void }) {
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    const { ok, data } = await request<{ paid: number }>("/api/payroll/pay-all", { method: "POST", json: { ...month, date: paymentDate, reference: reference || null } });
    if (!ok) return setError(data.error ?? "No se pudo registrar");
    onDone(`${data.paid} pago(s) registrados.`);
  }
  return (
    <Modal title="Registrar pagos del mes" open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Se marcarán como pagadas todas las personas verificadas, por <strong>{formatCop(total)}</strong>. Si a alguien se le paga en otra fecha, regístrelo desde su detalle.
        </p>
        <Field label="Fecha del pago">
          <input type="date" className="field" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </Field>
        <Field label="Referencia (opcional)">
          <input className="field" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <button type="button" onClick={pay} className="btn-cta">
            Registrar pagos
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
