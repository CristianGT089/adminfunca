"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader } from "@/components/core/ui";
import Selector from "@/components/core/Selector";
import Calendar, { type CalendarView } from "@/components/schedule/Calendar";
import EventModal, { type ModalOpening } from "@/components/schedule/EventModal";
import { MONTHS, formatHours, startOfDay, startOfWeek, addDays } from "@/components/schedule/dates";
import type { PublicEvent, Assignee } from "@/lib/modules/schedule/service";
import { EVENT_TYPE_COLOR, EVENT_TYPE_NAME, EVENT_TYPES } from "@/lib/modules/schedule/schemas";
import { managedTypes } from "@/lib/modules/schedule/permissions";
import type { PublicModule } from "@/lib/modules/academic/service";

const SAVED_VIEW = "admin-funca:schedule-view";

export default function SchedulePage() {
  const { session } = useSession();
  const [view, setView] = useState<CalendarView>("month");
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [modules, setModules] = useState<PublicModule[]>([]);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [opening, setOpening] = useState<ModalOpening | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The user's preferred view; on mobile, the list is more comfortable by default.
  useEffect(() => {
    // Read after mounting (outside render) so it doesn't clash with the prerendered HTML.
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem(SAVED_VIEW) as CalendarView | null;
        if (v) setView(v);
        else if (window.innerWidth < 640) setView("list");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const changeView = (v: CalendarView) => {
    setView(v);
    try {
      localStorage.setItem(SAVED_VIEW, v);
    } catch {}
  };

  // Visible range according to the view.
  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(date);
      return { from: start, to: addDays(start, 7) };
    }
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    // In the month view, the visible days of the neighboring months are fetched too.
    return view === "month" ? { from: startOfWeek(start), to: addDays(startOfWeek(addDays(end, -1)), 7) } : { from: start, to: end };
  }, [date, view]);

  const load = useCallback(
    () =>
      request<{ events: PublicEvent[] }>(
        `/api/schedule?from=${range.from.toISOString()}&to=${range.to.toISOString()}${teacherFilter ? `&teacherId=${teacherFilter}` : ""}${typeFilter ? `&type=${typeFilter}` : ""}`
      ).then(({ ok, data }) => {
        if (ok) setEvents(data.events);
      }),
    [range, teacherFilter, typeFilter]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([request<{ assignees: Assignee[] }>("/api/schedule/assignees"), request<{ modules: PublicModule[] }>("/api/modules?active=1")]).then(([a, m]) => {
      if (a.ok) setAssignees(a.data.assignees);
      if (m.ok) setModules(m.data.modules);
    });
  }, []);

  // Academic coordination manages everything; internship coordination, only internships / field trips.
  const types = useMemo(() => (session ? managedTypes(session.role) : []), [session]);
  const canCreate = types.length > 0;
  const move = (n: number) => setDate((d) => (view === "week" ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1)));
  const title = view === "week" ? `Semana del ${startOfWeek(date).getDate()} de ${MONTHS[startOfWeek(date).getMonth()]} ${startOfWeek(date).getFullYear()}` : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  // Totals of the visible period (only the month/week, without the neighboring days).
  const totals = useMemo(() => {
    const list = (events ?? []).filter((e) => {
      const d = new Date(e.startsAt);
      return view === "week" ? d >= startOfWeek(date) && d < addDays(startOfWeek(date), 7) : d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });
    const byType = new Map<string, number>();
    for (const e of list) if (e.payable) byType.set(e.type, (byType.get(e.type) ?? 0) + e.hours);
    return { entries: list.length, hours: list.reduce((s, e) => s + (e.payable ? e.hours : 0), 0), byType };
  }, [events, date, view]);

  return (
    <>
      <PageHeader
        eyebrow="Coordinación académica"
        title="Agenda académica"
        text="Clases de módulo, cursos, diplomados, prácticas y consultas de psicología. Las horas registradas aquí alimentan la nómina."
        action={
          canCreate && (
            <button type="button" onClick={() => setOpening({ mode: "new", startsAt: new Date() })} className="btn-cta">
              Nuevo registro
            </button>
          )
        }
      />

      {message && <Alert type="ok">{message}</Alert>}

      {/* Calendar navigation bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} aria-label="Anterior" className="btn-soft h-9 w-9 p-0">
            ‹
          </button>
          <button type="button" onClick={() => setDate(startOfDay(new Date()))} className="btn-soft px-3 py-1.5 text-xs">
            Hoy
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Siguiente" className="btn-soft h-9 w-9 p-0">
            ›
          </button>
          <h2 className="ml-2 font-heading text-lg font-bold text-blue-900 capitalize">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Selector compact className="w-48" aria-label="Filtrar por responsable" value={teacherFilter} onChange={setTeacherFilter} empty="Todos los responsables" options={assignees.map((d) => ({ value: d.id, label: `${d.lastNames}, ${d.firstNames}`, detail: d.role === "Docente" ? (d.program ?? undefined) : d.role }))} />
          <Selector compact className="w-44" aria-label="Filtrar por tipo" value={typeFilter} onChange={setTypeFilter} empty="Todos los tipos" searchable={false} options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_NAME[t] }))} />
          <div className="flex rounded-full border border-blue-200 bg-white p-0.5" role="tablist" aria-label="Vista">
            {(
              [
                ["month", "Mes"],
                ["week", "Semana"],
                ["list", "Lista"],
              ] as const
            ).map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => changeView(v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${view === v ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <strong className="text-blue-900">{totals.entries}</strong> registros · <strong className="text-blue-900">{formatHours(totals.hours)}</strong> a reconocer
        </span>
        {EVENT_TYPES.filter((t) => totals.byType.has(t)).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${EVENT_TYPE_COLOR[t].dot}`} />
            {EVENT_TYPE_NAME[t]} {formatHours(totals.byType.get(t)!)}
          </span>
        ))}
      </div>

      {events === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : (
        <Calendar
          view={view}
          date={view === "week" ? startOfWeek(date) : date}
          events={events}
          canCreate={canCreate}
          onDay={(d) => setOpening({ mode: "new", startsAt: d })}
          onEvent={(e) => setOpening({ mode: "edit", event: e })}
          onViewDay={(d) => {
            setDate(startOfDay(d));
            changeView("week");
          }}
        />
      )}

      <EventModal
        opening={opening}
        assignees={assignees}
        modules={modules}
        types={types}
        onClose={() => setOpening(null)}
        onDone={(m) => {
          setOpening(null);
          setMessage(m);
          setTimeout(() => setMessage(null), 3000);
          load();
        }}
      />
    </>
  );
}
