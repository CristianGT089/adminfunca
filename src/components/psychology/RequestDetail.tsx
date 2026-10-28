"use client";

import { useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, Field, Modal, formatDate } from "@/components/core/ui";
import { toLocalInput, formatTime } from "@/components/schedule/dates";
import { MODALITIES, MODALITY_NAME, type Modality } from "@/lib/modules/schedule/schemas";
import { CAMPUSES } from "@/lib/modules/inventory/schemas";
import type { PublicRequest } from "@/lib/modules/psychology/service";
import {
  ATTENDANCES,
  SESSION_MINUTES,
  REQUEST_STATUS,
  OPEN_STATUSES,
  REASONS,
  ATTENDANCE_NAME,
  REQUESTER_TYPE_NAME,
  REASON_NAME,
  ORIGIN_NAME,
  REFERRAL_NAME,
  REFERRALS,
} from "@/lib/modules/psychology/schemas";

export function RequestPill({ status }: { status: PublicRequest["status"] }) {
  const s = REQUEST_STATUS[status];
  return (
    <span title={s.help} className={`pill ${s.className}`}>
      {s.text}
    </span>
  );
}

export const appointmentText = (a: NonNullable<PublicRequest["appointment"]>) =>
  `${new Date(a.startsAt).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })} ${formatTime(a.startsAt)} · ${MODALITY_NAME[a.modality as Modality].toLowerCase()}`;

/** Detail of a request with the actions that apply to the user and the status. */
export default function RequestDetail({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: (message: string) => void }) {
  return (
    <Modal title="Solicitud de cita" open={!!id} onClose={onClose} width="max-w-2xl">
      {id && <Content key={id} id={id} onChange={onChange} />}
    </Modal>
  );
}

function Content({ id, onChange }: { id: string; onChange: (m: string) => void }) {
  const { can } = useSession();
  const [r, setR] = useState<PublicRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"schedule" | "feedback" | "cancel" | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(
    () =>
      request<{ request: PublicRequest }>(`/api/psychology/requests/${id}`).then(({ ok, data }) => {
        if (!ok) return setError(data.error ?? "No se pudo cargar");
        setR(data.request);
      }),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function action(name: string, body: unknown, message: string) {
    setWorking(true);
    setError(null);
    const { ok, data } = await request<{ request: PublicRequest }>(`/api/psychology/requests/${id}/${name}`, { method: "POST", json: body ?? {} });
    setWorking(false);
    if (!ok) {
      setError(data.error ?? "No se pudo completar la acción");
      return false;
    }
    setR(data.request);
    setPanel(null);
    onChange(message);
    return true;
  }

  if (!r) return error ? <Alert>{error}</Alert> : <p className="text-sm text-slate-400">Cargando...</p>;

  const professional = can("psychology.attend");
  const mine = r.isMine;
  const open = OPEN_STATUSES.includes(r.status);
  const appointmentStarted = !!r.appointment && new Date(r.appointment.startsAt) <= new Date();
  const d = r.detail;
  const canCancel = open && (professional ? !r.assignedTo || mine : (r.status === "PENDING" || r.status === "PENDING_VERIFICATION") && can("psychology.request"));

  const rows: [string, React.ReactNode][] = [
    ["Persona", `${r.fullName} · ${REQUESTER_TYPE_NAME[r.requesterType as keyof typeof REQUESTER_TYPE_NAME] ?? r.requesterType}`],
    ["Documento", d?.document ?? r.document],
    ...(d
      ? ([
          [
            "Teléfono",
            d.phone ? (
              <a href={`tel:${d.phone}`} className="text-blue-800 underline">
                {d.phone}
              </a>
            ) : (
              "—"
            ),
          ],
          [
            "Correo",
            <a key="c" href={`mailto:${d.email}`} className="text-blue-800 underline break-all">
              {d.email}
            </a>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ["Programa / área", [r.program, r.campus && `sede ${r.campus}`].filter(Boolean).join(" · ") || "—"],
    ...(d
      ? ([["Prefiere", [d.preferredModality ? MODALITY_NAME[d.preferredModality as Modality] : "Cualquier modalidad", d.availability].filter(Boolean).join(" · ")]] as [string, React.ReactNode][])
      : []),
    ["Origen", `${ORIGIN_NAME[r.origin]}${r.registeredBy ? ` · ${r.registeredBy.name}` : ""} · ${formatDate(r.createdAt)}`],
    ["Psicóloga", r.assignedTo ? `${r.assignedTo.name}${r.takenAt ? ` · desde ${formatDate(r.takenAt)}` : ""}` : "Sin asignar"],
    [
      "Cita",
      r.appointment
        ? `${appointmentText(r.appointment)}${r.appointment.campus ? ` · ${r.appointment.campus}` : ""}${r.appointment.location ? ` · ${r.appointment.location}` : ""}`
        : "Sin programar",
    ],
    ...(r.cancellationReason ? ([["Motivo de cancelación", r.cancellationReason]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-lg font-bold text-blue-900">#{r.number}</span>
        <RequestPill status={r.status} />
        {mine && <span className="pill bg-gold-100 text-gold-700">Mi caso</span>}
      </div>

      <dl className="grid gap-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="min-w-0 text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>

      {d?.reason && (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm">
          <p className="field-label">Lo que contó al pedir la cita</p>
          <p className="whitespace-pre-wrap text-slate-700">{d.reason}</p>
        </div>
      )}

      {d?.feedback && (
        <div className="rounded-2xl border border-blue-200 p-4 text-sm">
          <p className="field-label">Retroalimentación</p>
          <p>
            <strong>{ATTENDANCE_NAME[d.feedback.attendance as keyof typeof ATTENDANCE_NAME]}</strong>
            {d.feedback.reasonCategory && ` · motivo ${REASON_NAME[d.feedback.reasonCategory as keyof typeof REASON_NAME].toLowerCase()}`}
            {d.feedback.referral && d.feedback.referral !== "NONE" && ` · remitida a ${REFERRAL_NAME[d.feedback.referral as keyof typeof REFERRAL_NAME]}`}
            {d.feedback.needsFollowUp &&
              ` · requiere seguimiento${d.feedback.followUpDate ? ` hacia el ${new Date(`${d.feedback.followUpDate}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}` : ""}`}
          </p>
          {d.feedback.observation && <p className="mt-2 whitespace-pre-wrap text-slate-600">{d.feedback.observation}</p>}
        </div>
      )}

      {!professional && <p className="text-xs text-slate-400">Los datos de contacto, el motivo y las notas de la cita solo los ven las psicólogas.</p>}

      {error && <Alert>{error}</Alert>}

      {/* Actions */}
      {panel === null && (
        <div className="flex flex-wrap gap-2">
          {professional && r.status === "PENDING" && (
            <button type="button" disabled={working} onClick={() => action("take", null, `Tomó la solicitud #${r.number}.`)} className="btn-cta">
              Tomar este caso
            </button>
          )}
          {mine && (r.status === "TAKEN" || r.status === "SCHEDULED") && !appointmentStarted && (
            <button type="button" onClick={() => setPanel("schedule")} className={r.status === "TAKEN" ? "btn-cta" : "btn-secondary"}>
              {r.status === "TAKEN" ? "Programar la cita" : "Cambiar la hora"}
            </button>
          )}
          {mine && r.appointment && appointmentStarted && (r.status === "SCHEDULED" || d?.feedback) && (
            <button type="button" onClick={() => setPanel("feedback")} className={r.status === "SCHEDULED" ? "btn-cta" : "btn-secondary"}>
              {d?.feedback ? "Corregir retroalimentación" : "Registrar retroalimentación"}
            </button>
          )}
          {mine && !open && r.status !== "CANCELLED" && (
            <button type="button" disabled={working} onClick={() => action("followUp", null, "Se abrió un caso de seguimiento a su nombre.")} className="btn-soft">
              Abrir seguimiento
            </button>
          )}
          {mine && r.status === "TAKEN" && (
            <button type="button" disabled={working} onClick={() => action("release", null, "La solicitud volvió a la bandeja.")} className="btn-soft">
              Devolver a la bandeja
            </button>
          )}
          {canCancel && (
            <button type="button" onClick={() => setPanel("cancel")} className="btn-danger ml-auto">
              Cancelar solicitud
            </button>
          )}
        </div>
      )}

      {panel === "schedule" && <ScheduleForm r={r} working={working} onCancel={() => setPanel(null)} onSave={(b) => action("schedule", b, `Cita #${r.number} programada.`)} />}
      {panel === "feedback" && <FeedbackForm r={r} working={working} onCancel={() => setPanel(null)} onSave={(b) => action("feedback", b, `Retroalimentación de la #${r.number} guardada.`)} />}
      {panel === "cancel" && <CancelForm working={working} onCancel={() => setPanel(null)} onSave={(reason) => action("cancel", { reason }, `Solicitud #${r.number} cancelada.`)} />}
    </div>
  );
}

function ButtonGroup<T extends string>({ options, value, onChange, names }: { options: readonly T[]; value: T | ""; onChange: (v: T) => void; names: Record<T, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${value === o ? "border-blue-800 bg-blue-800 text-white" : "border-blue-200 bg-white text-slate-600 hover:bg-blue-50"}`}>
          {names[o]}
        </button>
      ))}
    </div>
  );
}

function ScheduleForm({ r, working, onCancel, onSave }: { r: PublicRequest; working: boolean; onCancel: () => void; onSave: (b: unknown) => void }) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const initial = r.appointment ? new Date(r.appointment.startsAt) : tomorrow;
  const [startsAt, setStartsAt] = useState(toLocalInput(initial));
  const [minutes, setMinutes] = useState(r.appointment ? Math.round((new Date(r.appointment.endsAt).getTime() - new Date(r.appointment.startsAt).getTime()) / 60000) : SESSION_MINUTES);
  const [modality, setModality] = useState<Modality>((r.appointment?.modality as Modality) ?? (r.detail?.preferredModality as Modality) ?? "IN_PERSON");
  const [campus, setCampus] = useState(r.appointment?.campus ?? r.campus ?? "");
  const [location, setLocation] = useState(r.appointment?.location ?? "");
  const [notify, setNotify] = useState(true);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const start = new Date(startsAt);
    onSave({ startsAt: start.toISOString(), endsAt: new Date(start.getTime() + minutes * 60000).toISOString(), modality, campus: campus || null, location: location || null, notify });
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-2xl border-2 border-gold-500/60 bg-gold-50 p-4 sm:grid-cols-2">
      <p className="sm:col-span-2 text-sm text-slate-600">Ponga la hora que acordó con la persona. La cita queda en su agenda y cuenta como horas de trabajo.</p>
      <Field label="Fecha y hora">
        <input type="datetime-local" required className="field" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </Field>
      <Field label="Duración">
        <select className="field" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutos` : `${m / 60} hora${m === 60 ? "" : "s"}`}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <span className="field-label">Modalidad</span>
        <ButtonGroup options={MODALITIES} value={modality} onChange={setModality} names={MODALITY_NAME} />
      </div>
      {modality === "IN_PERSON" ? (
        <>
          <Field label="Sede">
            <select className="field" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">Sin sede</option>
              {CAMPUSES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Lugar">
            <input className="field" maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Consultorio de bienestar" />
          </Field>
        </>
      ) : (
        <Field label="Enlace de la reunión" className="sm:col-span-2" help="Si aún no lo tiene, déjelo vacío y envíelo después.">
          <input className="field" type="url" maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://meet.google.com/…" />
        </Field>
      )}
      <label className="sm:col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-blue-800" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Enviar la fecha y hora al correo de la persona ({r.detail?.email})
      </label>
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button type="submit" disabled={working} className="btn-cta">
          {working ? "Guardando..." : "Guardar cita"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Volver
        </button>
      </div>
    </form>
  );
}

function FeedbackForm({ r, working, onCancel, onSave }: { r: PublicRequest; working: boolean; onCancel: () => void; onSave: (b: unknown) => void }) {
  const fb = r.detail?.feedback;
  const [attendance, setAttendance] = useState<(typeof ATTENDANCES)[number] | "">((fb?.attendance as (typeof ATTENDANCES)[number]) ?? "");
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">((fb?.reasonCategory as (typeof REASONS)[number]) ?? "");
  const [referral, setReferral] = useState<(typeof REFERRALS)[number]>((fb?.referral as (typeof REFERRALS)[number]) ?? "NONE");
  const [followUp, setFollowUp] = useState(fb?.needsFollowUp ?? false);
  const [followUpDate, setFollowUpDate] = useState(fb?.followUpDate ?? "");
  const [observation, setObservation] = useState(fb?.observation ?? "");
  const [error, setError] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!attendance) return setError("Indique si la persona asistió");
    if (attendance === "ATTENDED" && !reason) return setError("Indique el motivo de consulta");
    setError(null);
    onSave({
      attendance,
      referral: attendance === "ATTENDED" ? referral : "NONE",
      reasonCategory: reason || null,
      needsFollowUp: followUp,
      followUpDate: followUp && followUpDate ? followUpDate : null,
      observation: observation || null,
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border-2 border-gold-500/60 bg-gold-50 p-4">
      <div>
        <span className="field-label">¿Asistió?</span>
        <ButtonGroup options={ATTENDANCES} value={attendance} onChange={setAttendance} names={ATTENDANCE_NAME} />
        <p className="mt-1 text-xs text-slate-500">Las inasistencias también cuentan como horas: el tiempo quedó reservado.</p>
      </div>
      {attendance === "ATTENDED" && (
        <>
          <div>
            <span className="field-label">Motivo de consulta</span>
            <ButtonGroup options={REASONS} value={reason} onChange={setReason} names={REASON_NAME} />
          </div>
          <div>
            <span className="field-label">Remisión</span>
            <ButtonGroup options={REFERRALS} value={referral} onChange={setReferral} names={REFERRAL_NAME} />
          </div>
        </>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-blue-800" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
          Requiere seguimiento
        </label>
        {followUp && (
          <Field label="Fecha sugerida">
            <input type="date" className="field" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Observaciones" help="Solo usted las ve. Se guardan cifradas.">
        <textarea className="field" rows={3} maxLength={2000} value={observation} onChange={(e) => setObservation(e.target.value)} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className="btn-cta">
          {working ? "Guardando..." : "Guardar retroalimentación"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Volver
        </button>
      </div>
    </form>
  );
}

function CancelForm({ working, onCancel, onSave }: { working: boolean; onCancel: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(reason);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4"
    >
      <Field label="Motivo de la cancelación">
        <input className="field" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="La persona ya no la necesita, datos errados…" autoFocus />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className="btn-danger">
          Sí, cancelar la solicitud
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Volver
        </button>
      </div>
    </form>
  );
}
