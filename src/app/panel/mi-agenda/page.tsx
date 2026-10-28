"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader } from "@/components/core/ui";
import Calendar, { type CalendarView } from "@/components/schedule/Calendar";
import EventModal, { type ModalOpening } from "@/components/schedule/EventModal";
import { MONTHS, longDate, formatHours, formatTime, startOfDay, startOfWeek, addDays } from "@/components/schedule/dates";
import type { PublicEvent } from "@/lib/modules/schedule/service";
import { EVENT_TYPE_COLOR, EVENT_TYPE_NAME, TYPES_REQUIRING_CLOSING, type EventType } from "@/lib/modules/schedule/schemas";

/**
 * Schedule of whoever has an account linked to a person (psychology, internships): what they
 * have scheduled, what is left to close and their hours for the month.
 */
export default function MySchedulePage() {
  const { session, can } = useSession();
  const [view, setView] = useState<CalendarView>("list");
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [pending, setPending] = useState<PublicEvent[]>([]);
  const [types, setTypes] = useState<EventType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<ModalOpening | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(date);
      return { from: start, to: addDays(start, 7) };
    }
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return view === "month" ? { from: startOfWeek(start), to: addDays(startOfWeek(addDays(end, -1)), 7) } : { from: start, to: end };
  }, [date, view]);

  const load = useCallback(() => {
    const today = new Date();
    return Promise.all([
      request<{ events: PublicEvent[]; types: EventType[] }>(`/api/my-schedule?from=${range.from.toISOString()}&to=${range.to.toISOString()}`),
      // What is left to close from the last 60 days, regardless of the period being viewed.
      request<{ events: PublicEvent[] }>(`/api/my-schedule?from=${addDays(today, -60).toISOString()}&to=${today.toISOString()}`),
    ]).then(([a, r]) => {
      if (!a.ok) return setError(a.data.error ?? "No se pudo cargar la agenda");
      setEvents(a.data.events);
      setTypes(a.data.types);
      if (r.ok) setPending(r.data.events.filter((e) => TYPES_REQUIRING_CLOSING.includes(e.type) && !e.completion && new Date(e.startsAt) <= today));
    });
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (m: string) => {
    setOpening(null);
    setMessage(m);
    setTimeout(() => setMessage(null), 3000);
    load();
  };

  const move = (n: number) => setDate((d) => (view === "week" ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1)));
  const title = view === "week" ? `Semana del ${startOfWeek(date).getDate()} de ${MONTHS[startOfWeek(date).getMonth()]}` : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const ofMonth = (events ?? []).filter((e) => new Date(e.startsAt).getMonth() === date.getMonth() && e.payable && e.completion !== "CANCELLED");
  const monthHours = ofMonth.reduce((s, e) => s + e.hours, 0);
  const open = (e: PublicEvent) => setOpening({ mode: "edit", event: e });

  if (!session) return null;

  return (
    <>
      <PageHeader
        eyebrow={session.roleName}
        title="Mi agenda"
        text="Lo que tiene programado. Cuando una actividad ya empezó, registre cómo terminó: eso cuenta para la revisión de la nómina."
        action={
          types.length > 0 && (
            <button type="button" onClick={() => setOpening({ mode: "new", startsAt: new Date() })} className="btn-cta">
              {types.includes("FIELD_TRIP") ? "Programar práctica" : "Registrar actividad"}
            </button>
          )
        }
      />

      {error && <Alert>{error}</Alert>}
      {message && <Alert type="ok">{message}</Alert>}

      {pending.length > 0 && (
        <section className="card border-gold-500 p-5">
          <p className="eyebrow">Falta registrar cómo terminaron</p>
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className={`h-2 w-2 rounded-full ${EVENT_TYPE_COLOR[e.type].dot}`} />
                <span className="capitalize text-slate-500">
                  {longDate(new Date(e.startsAt))}, {formatTime(e.startsAt)}
                </span>
                <span className="font-semibold text-blue-900">{e.title}</span>
                {e.request ? (
                  <Link href={`/panel/psicologia?request=${e.request.id}`} className="btn-soft ml-auto px-3 py-1 text-xs">
                    Registrar retroalimentación
                  </Link>
                ) : (
                  <button type="button" onClick={() => open(e)} className="btn-soft ml-auto px-3 py-1 text-xs">
                    Registrar cierre
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex rounded-full border border-blue-200 bg-white p-0.5 w-fit" role="tablist" aria-label="Vista">
          {(
            [
              ["list", "Lista"],
              ["week", "Semana"],
              ["month", "Mes"],
            ] as const
          ).map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${view === v ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {view !== "week" && (
        <p className="text-xs text-slate-500">
          <strong className="text-blue-900">{ofMonth.length}</strong> actividades · <strong className="text-blue-900">{formatHours(monthHours)}</strong> en {MONTHS[date.getMonth()]}
          {ofMonth.length > 0 && ` (${[...new Set(ofMonth.map((e) => e.type))].map((t) => EVENT_TYPE_NAME[t].toLowerCase()).join(", ")})`}
        </p>
      )}

      {events === null ? (
        !error && <p className="text-sm text-slate-400">Cargando...</p>
      ) : (
        <Calendar
          view={view}
          date={view === "week" ? startOfWeek(date) : date}
          events={events}
          canCreate={types.length > 0}
          onDay={(d) => setOpening({ mode: "new", startsAt: d })}
          onEvent={open}
          onViewDay={(d) => {
            setDate(startOfDay(d));
            setView("week");
          }}
        />
      )}

      {can("psychology.attend") && (
        <p className="text-xs text-slate-400">
          Las consultas individuales se programan desde{" "}
          <Link href="/panel/psicologia" className="font-semibold text-blue-800 hover:underline">
            Psicología
          </Link>
          , cuando acuerde la hora con la persona.
        </p>
      )}

      <EventModal opening={opening} assignees={[]} modules={[]} types={types} own onClose={() => setOpening(null)} onDone={notify} />
    </>
  );
}
