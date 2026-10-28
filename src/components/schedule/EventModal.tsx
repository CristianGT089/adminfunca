"use client";

import Link from "next/link";
import { useState } from "react";
import { request } from "@/components/core/useSession";
import { Alert, Field, Modal, formatDate } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import type { PublicEvent, Assignee } from "@/lib/modules/schedule/service";
import { EVENT_TYPE_COLOR, COMPLETIONS, WEEKDAYS, MODALITIES, COMPLETION_NAME, MODALITY_NAME, EVENT_TYPE_NAME, EVENT_TYPES, type Completion, type Modality, type EventType } from "@/lib/modules/schedule/schemas";
import type { PublicModule } from "@/lib/modules/academic/service";
import { CAMPUSES } from "@/lib/modules/inventory/schemas";
import { toLocalInput, fromLocalInput, formatHours, formatTime, addDays } from "./dates";
import { atHour, SHIFT_DEFINITION, endDateForHours, hoursPerSession, SHIFTS, firstSession, shiftSessions, type Shift } from "@/lib/modules/schedule/shifts";

export type ModalOpening = { mode: "new"; startsAt: Date } | { mode: "edit"; event: PublicEvent };

type FormState = {
  type: EventType;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  hours: string;
  modality: Modality;
  hourlyRate: string;
  campus: string;
  location: string;
  studentCount: string;
  payable: boolean;
  teacherId: string;
  moduleId: string;
  repeat: boolean;
  days: number[];
  until: string;
  // Module classes: scheduling by standard shift.
  scheduling: "shift" | "manual";
  shift: Shift;
  shiftFrom: string;
  shiftUntil: string;
};

function initialForm(o: ModalOpening, types: EventType[]): FormState {
  if (o.mode === "edit") {
    const e = o.event;
    return {
      type: e.type,
      title: e.title,
      description: e.description ?? "",
      startsAt: toLocalInput(new Date(e.startsAt)),
      endsAt: toLocalInput(new Date(e.endsAt)),
      hours: String(e.hours),
      modality: e.modality,
      hourlyRate: e.hourlyRate?.toString() ?? "",
      campus: e.campus ?? "",
      location: e.location ?? "",
      studentCount: e.studentCount?.toString() ?? "",
      payable: e.payable,
      teacherId: e.teacher?.id ?? "",
      moduleId: e.module?.id ?? "",
      repeat: false,
      days: [],
      until: "",
      scheduling: "manual",
      shift: e.shift ?? "DAYTIME",
      shiftFrom: "",
      shiftUntil: "",
    };
  }
  const start = new Date(o.startsAt);
  if (start.getHours() === 0 && start.getMinutes() === 0) start.setHours(8, 0);
  const end = new Date(start.getTime() + 2 * 3600000);
  return {
    type: types[0] ?? "MODULE_CLASS", title: "", description: "", startsAt: toLocalInput(start), endsAt: toLocalInput(end), hours: "", modality: "IN_PERSON", hourlyRate: "", campus: "", location: "", studentCount: "", payable: true,
    teacherId: "", moduleId: "", repeat: false, days: [start.getDay()], until: toLocalInput(addDays(start, 56)).slice(0, 10),
    scheduling: "shift", shift: "DAYTIME", shiftFrom: toLocalInput(start).slice(0, 10), shiftUntil: "",
  };
}

const hoursBetween = (a: string, b: string) => Math.max(0, Math.round(((fromLocalInput(b).getTime() - fromLocalInput(a).getTime()) / 3600000) * 100) / 100);

type Props = {
  opening: ModalOpening | null;
  assignees: Assignee[];
  modules: PublicModule[];
  /** Types this user can create or edit here. */
  types: EventType[];
  /** "My schedule": the entry goes under the name of whoever creates it (no person-in-charge selector). */
  own?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
};

export default function EventModal(p: Props) {
  const { opening, types, onClose } = p;
  const event = opening?.mode === "edit" ? opening.event : null;
  // Read only: sessions coming from a request or types this user does not manage.
  const readOnly = !!event && (!!event.request || !types.includes(event.type));
  const title = readOnly ? "Detalle del registro" : event ? "Editar registro" : "Nuevo registro en la agenda";
  return (
    <Modal title={title} open={!!opening} onClose={onClose} width={readOnly ? "max-w-lg" : "max-w-3xl"}>
      {event && readOnly ? (
        <Detail event={event} onClose={onClose} />
      ) : (
        opening && <Form key={event ? event.id : "new"} {...p} opening={opening} />
      )}
    </Modal>
  );
}

/** Read-only view of an entry (and its closing). */
function Detail({ event: e, onClose }: { event: PublicEvent; onClose: () => void }) {
  const c = EVENT_TYPE_COLOR[e.type];
  const rows: [string, string | null][] = [
    ["Responsable", e.teacher?.fullName ?? "Sin asignar"],
    ["Cuándo", `${new Date(e.startsAt).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}, ${formatTime(e.startsAt)}–${formatTime(e.endsAt)} (${formatHours(e.hours)})`],
    ["Modalidad", MODALITY_NAME[e.modality]],
    ["Lugar", [e.campus, e.location].filter(Boolean).join(" · ") || null],
    ["Módulo", e.module ? `${e.module.program} · ${e.module.name}` : null],
    ["Cierre", e.completion ? `${COMPLETION_NAME[e.completion].text}${e.closedAt ? ` · ${formatDate(e.closedAt)}` : ""}` : null],
    ["Nota de cierre", e.closingNote],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${c.bg} ${c.text}`}>{EVENT_TYPE_NAME[e.type]}</span>
        <span className="font-heading font-bold text-blue-900">{e.title}</span>
      </div>
      <dl className="grid gap-2 text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-800 break-words">{v}</dd>
            </div>
          ))}
      </dl>
      {e.request && (
        <Alert type="info">
          Esta consulta viene de la solicitud #{e.request.number}. La hora y la retroalimentación se manejan desde Psicología.{" "}
          <Link href={`/panel/psicologia?request=${e.request.id}`} className="font-semibold underline">
            Abrir la solicitud
          </Link>
        </Alert>
      )}
      <div>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cerrar
        </button>
      </div>
    </div>
  );
}

/** Records whether the activity took place. Shown when editing an entry whose start time has passed. */
export function EventClosing({ event, onDone }: { event: PublicEvent; onDone: (m: string) => void }) {
  const [completion, setCompletion] = useState<Completion | "">(event.completion ?? "");
  const [note, setNote] = useState(event.closingNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!completion) return setError("Indique si la actividad se realizó");
    setSaving(true);
    setError(null);
    const { ok, data } = await request(`/api/schedule/${event.id}/close`, { method: "POST", json: { completion, note: note || null } });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo guardar el cierre");
    onDone("Cierre registrado.");
  }
  return (
    <div className="rounded-2xl border-2 border-gold-500/60 bg-gold-50 p-4">
      <p className="field-label">¿Cómo terminó esta actividad?</p>
      <div className="flex flex-wrap gap-1.5">
        {COMPLETIONS.map((c) => (
          <button key={c} type="button" title={COMPLETION_NAME[c].help} onClick={() => setCompletion(c)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${completion === c ? "border-blue-800 bg-blue-800 text-white" : "border-blue-200 bg-white text-slate-600 hover:bg-blue-50"}`}>
            {COMPLETION_NAME[c].text}
          </button>
        ))}
      </div>
      {completion && <p className="mt-1 text-xs text-slate-500">{COMPLETION_NAME[completion].help}</p>}
      <textarea className="field mt-3" rows={2} maxLength={500} placeholder="Nota (opcional): empresa visitada, aprendices, novedades…" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <button type="button" onClick={save} disabled={saving} className="btn-primary mt-3 px-4 py-2 text-xs">
        {saving ? "Guardando..." : event.completion ? "Actualizar cierre" : "Guardar cierre"}
      </button>
    </div>
  );
}

function Form({ opening, assignees, modules, types, own, onClose, onDone }: Props & { opening: ModalOpening }) {
  const [f, setF] = useState<FormState>(() => initialForm(opening, types));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<"one" | "series">("one");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = opening.mode === "edit" ? opening.event : null;
  const inSeries = !!editing?.seriesId;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const autoHours = hoursBetween(f.startsAt, f.endsAt);
  const teacher = assignees.find((d) => d.id === f.teacherId);
  const assigned = (moduleId: string) => !!teacher?.moduleIds.includes(moduleId);
  // If the teacher has assigned modules they are shown first; any module can still be chosen.
  const sortedModules = [...modules].sort((a, b) => {
    const pa = assigned(a.id) ? 0 : 1;
    const pb = assigned(b.id) ? 0 : 1;
    return pa - pb || a.program.localeCompare(b.program) || a.name.localeCompare(b.name);
  });

  const selectedModule = modules.find((m) => m.id === f.moduleId);
  const byShift = !editing && f.type === "MODULE_CLASS" && f.scheduling === "shift";
  const base = own ? "/api/my-schedule" : "/api/schedule";
  const alreadyStarted = !!editing && new Date(editing.startsAt) <= new Date();
  const fromDate = f.shiftFrom ? new Date(`${f.shiftFrom}T00:00:00`) : null;
  const untilDate = f.shiftUntil ? new Date(`${f.shiftUntil}T00:00:00`) : null;
  const sessions = byShift && fromDate && untilDate ? shiftSessions(f.shift, fromDate, untilDate) : [];
  const plannedHours = sessions.length * hoursPerSession(f.shift);
  const difference = selectedModule?.hours != null ? plannedHours - selectedModule.hours : null;

  function adjustEndDate(shift: Shift = f.shift, from = f.shiftFrom, hours = selectedModule?.hours) {
    if (!from || hours == null) return;
    const end = endDateForHours(shift, new Date(`${from}T00:00:00`), hours);
    if (end) set("shiftUntil", toLocalInput(end).slice(0, 10));
  }

  function chooseModule(id: string) {
    const m = modules.find((x) => x.id === id);
    setF((x) => ({ ...x, moduleId: id, title: x.title || (m ? m.name : "") }));
    // With the shift and start date already set, the end date is proposed from the module hours.
    if (m?.hours != null && f.shiftFrom && !f.shiftUntil) adjustEndDate(f.shift, f.shiftFrom, m.hours);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    if (byShift && (!fromDate || !untilDate)) {
      setSaving(false);
      return setError("Indique la fecha de inicio y la fecha fin del módulo");
    }
    if (byShift && sessions.length === 0) {
      setSaving(false);
      return setError("Entre esas fechas no cae ningún día de la jornada elegida");
    }
    const def = SHIFT_DEFINITION[f.shift];
    const body = {
      type: f.type,
      shift: f.type === "MODULE_CLASS" ? f.shift : null,
      title: f.title,
      description: f.description || null,
      startsAt: byShift ? atHour(sessions[0], def.startHour).toISOString() : fromLocalInput(f.startsAt).toISOString(),
      endsAt: byShift ? atHour(sessions[0], def.endHour).toISOString() : fromLocalInput(f.endsAt).toISOString(),
      hours: f.hours === "" ? null : Number(f.hours),
      modality: f.modality,
      hourlyRate: f.hourlyRate === "" ? null : Number(f.hourlyRate),
      campus: f.campus || null,
      location: f.location || null,
      studentCount: f.studentCount === "" ? null : Number(f.studentCount),
      payable: f.payable,
      teacherId: f.teacherId || null,
      moduleId: f.type === "MODULE_CLASS" ? f.moduleId || null : null,
      ...(editing
        ? { scope }
        : byShift
          ? { byShift: { shift: f.shift, from: f.shiftFrom, until: f.shiftUntil } }
          : { repeat: f.repeat && f.days.length > 0 ? { days: f.days, until: f.until } : null }),
    };
    const { ok, data } = await request<{ events?: PublicEvent[] }>(editing ? `${base}/${editing.id}` : base, { method: editing ? "PATCH" : "POST", json: body });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo guardar");
    onDone(editing ? "Registro actualizado." : data.events && data.events.length > 1 ? `${data.events.length} sesiones registradas.` : "Registro creado.");
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    const { ok, data } = await request<{ deleted: number }>(`${base}/${editing.id}?scope=${scope}`, { method: "DELETE" });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo eliminar");
    onDone(data.deleted > 1 ? `${data.deleted} sesiones eliminadas.` : "Registro eliminado.");
  }

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      {alreadyStarted && editing && (
        <div className="sm:col-span-2">
          <EventClosing event={editing} onDone={onDone} />
        </div>
      )}
      <div className={`sm:col-span-2 ${types.length === 1 ? "hidden" : ""}`}>
        <span className="field-label">Tipo</span>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.filter((t) => types.includes(t)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("type", t)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${f.type === t ? `${EVENT_TYPE_COLOR[t].bg} ${EVENT_TYPE_COLOR[t].text} ${EVENT_TYPE_COLOR[t].border}` : "border-blue-200 bg-white text-slate-600 hover:bg-blue-50"}`}
            >
              {EVENT_TYPE_NAME[t]}
            </button>
          ))}
        </div>
      </div>

      {!own && (
        <Field label={f.type === "MODULE_CLASS" ? "Docente" : "Responsable"} className={f.type === "MODULE_CLASS" ? "" : "sm:col-span-2"}>
          <Selector
            value={f.teacherId}
            onChange={(v) => set("teacherId", v)}
            empty="Sin responsable asignado"
            options={assignees.map((d) => ({
              value: d.id,
              label: `${d.lastNames}, ${d.firstNames}`,
              group: d.role === "Docente" ? "Docentes" : d.role,
              detail: [d.program, d.moduleIds.length ? `${d.moduleIds.length} módulo${d.moduleIds.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || undefined,
            }))}
          />
        </Field>
      )}
      {f.type === "MODULE_CLASS" && (
        <Field label="Módulo académico" help={teacher && teacher.moduleIds.length > 0 ? "Primero aparecen los módulos asignados al docente." : undefined}>
          <Selector
            value={f.moduleId}
            onChange={chooseModule}
            placeholder="Seleccione un módulo"
            options={sortedModules.map((m) => ({
              value: m.id,
              label: m.name,
              detail: m.hours != null ? `${m.hours} h` : undefined,
              group: assigned(m.id) ? `Asignados a ${teacher!.firstNames}` : m.program,
            }))}
          />
        </Field>
      )}

      <Field label="Título" className="sm:col-span-2">
        <input className="field" required value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={f.type === "COURSE" ? "Nombre del curso" : f.type === "PSYCHOLOGY_SESSION" ? "Consulta individual, taller…" : "Nombre"} />
      </Field>

      {!editing && f.type === "MODULE_CLASS" && (
        <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="field-label mb-0">Programación</span>
            <div className="flex rounded-full border border-blue-200 bg-white p-0.5">
              {(
                [
                  ["shift", "Por jornada"],
                  ["manual", "Manual"],
                ] as const
              ).map(([v, t]) => (
                <button key={v} type="button" onClick={() => set("scheduling", v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.scheduling === v ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {byShift && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {SHIFTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      set("shift", s);
                      if (f.shiftFrom && selectedModule?.hours != null) adjustEndDate(s);
                    }}
                    className={`rounded-2xl border p-3 text-left transition-colors ${f.shift === s ? "border-blue-800 bg-white shadow-[0_8px_20px_-12px_rgba(30,46,85,0.4)]" : "border-blue-200 bg-white/60 hover:bg-white"}`}
                  >
                    <span className="block font-heading font-bold text-blue-900">{SHIFT_DEFINITION[s].name}</span>
                    <span className="block text-xs text-slate-500">{SHIFT_DEFINITION[s].description}</span>
                    <span className="block mt-1 text-[11px] font-semibold text-blue-700">{hoursPerSession(s)} h por sesión</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha de inicio" help={fromDate ? `Primera clase: ${firstSession(f.shift, fromDate).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}` : undefined}>
                  <input
                    type="date"
                    className="field"
                    value={f.shiftFrom}
                    onChange={(e) => {
                      set("shiftFrom", e.target.value);
                      if (e.target.value && selectedModule?.hours != null) adjustEndDate(f.shift, e.target.value);
                    }}
                  />
                </Field>
                <Field label="Fecha fin" help={selectedModule?.hours != null ? `Propuesta según las ${selectedModule.hours} h del módulo; puede cambiarla.` : "Seleccione un módulo con horas para proponerla automáticamente."}>
                  <div className="flex gap-2">
                    <input type="date" className="field" value={f.shiftUntil} min={f.shiftFrom || undefined} onChange={(e) => set("shiftUntil", e.target.value)} />
                    {selectedModule?.hours != null && f.shiftFrom && (
                      <button type="button" onClick={() => adjustEndDate()} className="btn-soft shrink-0 px-3 py-1 text-xs" title="Calcular la fecha fin con las horas del módulo">
                        Calcular
                      </button>
                    )}
                  </div>
                </Field>
              </div>
              {fromDate && untilDate && (
                <div className={`rounded-xl px-3 py-2 text-sm ${sessions.length === 0 ? "bg-red-50 text-red-700" : difference === null || difference === 0 ? "bg-emerald-50 text-emerald-800" : "bg-gold-50 text-gold-700"}`}>
                  {sessions.length === 0 ? (
                    "Entre esas fechas no cae ningún día de la jornada."
                  ) : (
                    <>
                      <strong>{sessions.length} sesiones</strong> · <strong>{plannedHours} h</strong> en total
                      {selectedModule?.hours != null && (
                        <>
                          {" "}
                          · módulo de {selectedModule.hours} h:{" "}
                          {difference === 0
                            ? "coincide"
                            : difference! > 0 && difference! < hoursPerSession(f.shift)
                              ? `no cierra en sesiones completas; la última sesión queda con ${difference} h de más`
                              : difference! > 0
                                ? `sobran ${difference} h (${Math.floor(difference! / hoursPerSession(f.shift))} sesión(es) de más)`
                                : `faltan ${-difference!} h`}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!byShift && (
        <>
          <Field label="Inicio">
            <input type="datetime-local" className="field" required value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          </Field>
          <Field label="Fin">
            <input type="datetime-local" className="field" required value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
          </Field>
          <Field label="Horas a reconocer" help={`Calculadas: ${autoHours} h. Déjelo vacío para usar ese valor.`}>
            <input type="number" min={0} max={24} step={0.5} className="field" value={f.hours} placeholder={String(autoHours)} onChange={(e) => set("hours", e.target.value)} />
          </Field>
        </>
      )}
      {editing && f.type === "MODULE_CLASS" && (
        <Field label="Jornada">
          <Selector value={f.shift} onChange={(v) => set("shift", v as Shift)} searchable={false} options={SHIFTS.map((s) => ({ value: s, label: SHIFT_DEFINITION[s].name, detail: SHIFT_DEFINITION[s].description }))} />
        </Field>
      )}
      {!own && (
        <Field
          label={f.type === "COURSE" ? "Valor de la hora (obligatorio)" : "Valor de la hora"}
          help={f.type === "COURSE" ? "Los cursos no tienen tarifa fija: se paga según el perfil del docente." : "Vacío: se usa el valor base de la persona en la nómina."}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input type="number" min={0} step={500} required={f.type === "COURSE"} className="field pl-8" value={f.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} placeholder={f.type === "COURSE" ? "Ej. 45000" : "Valor base"} />
          </div>
        </Field>
      )}
      <Field label="Estudiantes a cargo" help="Para la remuneración variable.">
        <input type="number" min={0} className="field" value={f.studentCount} onChange={(e) => set("studentCount", e.target.value)} />
      </Field>

      <div className="sm:col-span-2">
        <span className="field-label">Modalidad</span>
        <div className="flex rounded-full border border-blue-200 bg-white p-0.5 w-fit">
          {MODALITIES.map((m) => (
            <button key={m} type="button" onClick={() => set("modality", m)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${f.modality === m ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"}`}>
              {MODALITY_NAME[m]}
            </button>
          ))}
        </div>
      </div>
      <Field label="Sede">
        <Selector value={f.campus} onChange={(v) => set("campus", v)} empty="Sin sede" searchable={false} options={CAMPUSES.map((s) => ({ value: s, label: s }))} />
      </Field>
      {f.modality === "VIRTUAL" ? (
        <Field label="Enlace de la reunión" help="Meet, Teams, Zoom…">
          <input className="field" type="url" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="https://" />
        </Field>
      ) : (
        <Field label="Lugar" help="Salón, institución, dirección…">
          <input className="field" value={f.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
      )}

      <Field label="Observaciones" className="sm:col-span-2">
        <textarea className="field" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" className="h-4 w-4 accent-blue-800" checked={f.payable} onChange={(e) => set("payable", e.target.checked)} />
        Cuenta para la nómina
      </label>

      {!editing && !byShift && (
        <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <input type="checkbox" className="h-4 w-4 accent-blue-800" checked={f.repeat} onChange={(e) => set("repeat", e.target.checked)} />
            Repetir cada semana
          </label>
          {f.repeat && (
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div>
                <span className="field-label">Días</span>
                <div className="flex gap-1">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      title={d.name}
                      onClick={() => set("days", f.days.includes(d.value) ? f.days.filter((x) => x !== d.value) : [...f.days, d.value])}
                      className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${f.days.includes(d.value) ? "bg-blue-800 text-white" : "bg-white border border-blue-200 text-slate-600"}`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Hasta">
                <input type="date" className="field" value={f.until} onChange={(e) => set("until", e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      )}

      {editing && inSeries && (
        <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 text-sm">
          <span className="field-label">Este registro hace parte de una serie semanal</span>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === "one"} onChange={() => setScope("one")} /> Solo esta sesión
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === "series"} onChange={() => setScope("series")} /> Toda la serie (al eliminar: esta y las siguientes)
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="sm:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving} className="btn-cta">
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancelar
        </button>
        {editing && !confirmDelete && (
          <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger ml-auto">
            Eliminar
          </button>
        )}
        {editing && confirmDelete && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            ¿Eliminar{scope === "series" && inSeries ? " esta y las siguientes sesiones" : ""}?
            <button type="button" onClick={remove} disabled={saving} className="btn-danger px-3 py-1.5 text-xs">
              Sí, eliminar
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="btn-soft px-3 py-1.5 text-xs">
              No
            </button>
          </span>
        )}
      </div>
    </form>
  );
}
