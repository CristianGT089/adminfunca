"use client";

import type { PublicEvent } from "@/lib/modules/schedule/service";
import { EVENT_TYPE_COLOR, COMPLETION_NAME, EVENT_TYPE_NAME, TYPES_REQUIRING_CLOSING } from "@/lib/modules/schedule/schemas";
import { SHORT_DAYS, dayKey, longDate, formatHours, formatTime, sameDay, monthWeeks, addDays } from "./dates";

export type CalendarView = "month" | "week" | "list";

type Props = {
  view: CalendarView;
  date: Date; // reference (month or week being shown)
  events: PublicEvent[];
  canCreate: boolean;
  onDay: (d: Date) => void; // create on that day
  onEvent: (e: PublicEvent) => void;
  onViewDay?: (d: Date) => void; // open the week of that day (days with many entries)
};

function group(events: PublicEvent[]) {
  const m = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const k = dayKey(new Date(e.startsAt));
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}

export default function Calendar(p: Props) {
  if (p.view === "month") return <Month {...p} />;
  if (p.view === "week") return <Week {...p} />;
  return <List {...p} />;
}

/** Closing mark: ✓ completed, ✗ not completed / cancelled, ! closing pending. */
function Mark({ e }: { e: PublicEvent }) {
  if (e.completion === "COMPLETED") return <span title="Realizada" className="font-bold text-emerald-700">✓ </span>;
  if (e.completion) return <span title={COMPLETION_NAME[e.completion].text} className="font-bold text-red-600">✗ </span>;
  if (TYPES_REQUIRING_CLOSING.includes(e.type) && new Date(e.startsAt) <= new Date()) return <span title="Falta registrar el cierre" className="font-bold text-gold-700">! </span>;
  return null;
}

function Chip({ e, onClick, compact = false }: { e: PublicEvent; onClick: () => void; compact?: boolean }) {
  const c = EVENT_TYPE_COLOR[e.type];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${EVENT_TYPE_NAME[e.type]} · ${e.title}${e.teacher ? ` · ${e.teacher.fullName}` : ""}`}
      className={`w-full rounded-lg border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight ${c.bg} ${c.text} ${c.border} hover:brightness-95 ${!e.payable ? "opacity-60 line-through" : ""}`}
    >
      <Mark e={e} />
      <span className="font-semibold">{formatTime(e.startsAt)}</span> {e.title}
      {e.modality === "VIRTUAL" && <span className="opacity-70"> · virtual</span>}
      {!compact && e.teacher && <span className="block truncate opacity-80">{e.teacher.fullName}</span>}
    </button>
  );
}

function Month({ date, events, canCreate, onDay, onEvent, onViewDay }: Props) {
  const today = new Date();
  const weeks = monthWeeks(date.getFullYear(), date.getMonth());
  const byDay = group(events);
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-blue-200 bg-blue-50/60">
        {SHORT_DAYS.map((d) => (
          <div key={d} className="px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((w, i) => (
        <div key={i} className="grid grid-cols-7 border-b border-blue-100 last:border-b-0">
          {w.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const otherMonth = d.getMonth() !== date.getMonth();
            const isToday = sameDay(d, today);
            return (
              <div key={k} className={`min-h-20 sm:min-h-28 border-r border-blue-100 last:border-r-0 p-1 ${otherMonth ? "bg-slate-50/60" : ""}`}>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!canCreate}
                    onClick={() => onDay(d)}
                    title={canCreate ? "Nuevo registro este día" : undefined}
                    className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? "bg-gold-500 text-blue-950" : otherMonth ? "text-slate-400" : "text-slate-700"} ${canCreate ? "hover:bg-blue-100" : ""}`}
                  >
                    {d.getDate()}
                  </button>
                  {list.length > 0 && <span className="sm:hidden text-[10px] text-slate-400">{list.length}</span>}
                </div>
                {/* On mobile only colored dots; on medium screens the chips. */}
                <button type="button" onClick={() => (list.length ? onViewDay?.(d) : onDay(d))} aria-label={`${list.length} registros`} className="mt-1 flex flex-wrap gap-0.5 sm:hidden min-h-3 w-full">
                  {list.slice(0, 8).map((e) => (
                    <span key={e.id} className={`h-2 w-2 rounded-full ${EVENT_TYPE_COLOR[e.type].dot}`} />
                  ))}
                </button>
                <div className="mt-1 hidden sm:flex flex-col gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <Chip key={e.id} e={e} compact onClick={() => onEvent(e)} />
                  ))}
                  {list.length > 3 && (
                    <button type="button" onClick={() => onViewDay?.(d)} className="rounded-lg px-1 py-0.5 text-left text-[10px] font-semibold text-blue-800 hover:bg-blue-100">
                      +{list.length - 3} más
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Week({ date, events, canCreate, onDay, onEvent }: Props) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i));
  const byDay = group(events);
  return (
    <div className="card overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[52rem]">
        {days.map((d) => {
          const list = byDay.get(dayKey(d)) ?? [];
          const hours = list.reduce((s, e) => s + e.hours, 0);
          return (
            <div key={dayKey(d)} className="border-r border-blue-100 last:border-r-0 flex flex-col">
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => onDay(d)}
                className={`px-2 py-2 text-left border-b border-blue-200 ${sameDay(d, today) ? "bg-gold-50" : "bg-blue-50/60"} ${canCreate ? "hover:bg-blue-100" : ""}`}
              >
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{SHORT_DAYS[(d.getDay() + 6) % 7]}</span>
                <span className={`font-heading text-lg font-bold ${sameDay(d, today) ? "text-gold-700" : "text-blue-900"}`}>{d.getDate()}</span>
                {hours > 0 && <span className="ml-2 text-xs text-slate-500">{formatHours(hours)}</span>}
              </button>
              <div className="flex flex-col gap-1 p-1 min-h-40">
                {list.map((e) => (
                  <Chip key={e.id} e={e} onClick={() => onEvent(e)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function List({ date, view, events, canCreate, onDay, onEvent }: Props) {
  const byDay = group(events);
  const keys = Array.from(byDay.keys()).sort();
  if (keys.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-blue-200 px-4 py-10 text-center text-sm text-slate-400">
        Sin registros en este periodo.
        {canCreate && (
          <button type="button" onClick={() => onDay(date)} className="ml-2 font-semibold text-blue-800 hover:underline">
            Crear uno
          </button>
        )}
      </div>
    );
  }
  void view;
  return (
    <div className="flex flex-col gap-4">
      {keys.map((k) => {
        const list = byDay.get(k)!;
        const d = new Date(list[0].startsAt);
        const hours = list.reduce((s, e) => s + (e.payable ? e.hours : 0), 0);
        return (
          <section key={k}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-heading font-semibold text-blue-900 capitalize">{longDate(d)}</h3>
              <span className="text-xs text-slate-500">{formatHours(hours)}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((e) => {
                const c = EVENT_TYPE_COLOR[e.type];
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => onEvent(e)} className={`card-sm w-full p-3 text-left border-l-4 ${c.border} hover:bg-blue-50/40 ${!e.payable ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm text-slate-600">
                          {formatTime(e.startsAt)}–{formatTime(e.endsAt)}
                        </span>
                        <span className={`pill ${c.bg} ${c.text}`}>{EVENT_TYPE_NAME[e.type]}</span>
                        <span className="font-semibold text-blue-900">
                          <Mark e={e} />
                          {e.title}
                        </span>
                        {e.completion && <span className={`pill ${COMPLETION_NAME[e.completion].className}`}>{COMPLETION_NAME[e.completion].text}</span>}
                        <span className="ml-auto text-xs text-slate-500">{formatHours(e.hours)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[e.teacher?.fullName, e.module ? `${e.module.program} · ${e.module.name}` : null, e.modality === "VIRTUAL" ? "Virtual" : null, [e.campus, e.modality === "VIRTUAL" ? null : e.location].filter(Boolean).join(" · "), e.studentCount != null ? `${e.studentCount} estudiantes` : null, !e.payable ? "no se paga" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
