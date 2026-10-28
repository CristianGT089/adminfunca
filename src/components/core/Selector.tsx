"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SelectorOption = {
  value: string;
  label: string;
  detail?: string; // secondary line
  group?: string; // group header
  disabled?: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectorOption[];
  /** "Empty" option at the top (e.g. "Sin docente asignado"). */
  empty?: string;
  placeholder?: string;
  searchable?: boolean;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const normalize = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Custom dropdown: panel with search, groups, a secondary line per option and keyboard
 * navigation. Replaces the native <select> where the list is long.
 */
export default function Selector({
  value,
  onChange,
  options,
  empty,
  placeholder = "Seleccione",
  searchable = true,
  compact = false,
  disabled,
  className = "",
  ...rest
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const all = useMemo<SelectorOption[]>(() => (empty !== undefined ? [{ value: "", label: empty }, ...options] : options), [empty, options]);
  const visible = useMemo(() => {
    const t = normalize(q.trim());
    if (!t) return all;
    return all.filter((o) => normalize(`${o.label} ${o.detail ?? ""} ${o.group ?? ""}`).includes(t));
  }, [all, q]);
  const selected = all.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      document.removeEventListener("mousedown", outside);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    if (disabled) return;
    setQ("");
    setActive(Math.max(0, visible.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function choose(o: SelectorOption) {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
  }
  function onKeyboard(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible[active]) choose(visible[active]);
    }
  }

  // Groups in order of appearance.
  const groups: { group?: string; items: { o: SelectorOption; i: number }[] }[] = [];
  visible.forEach((o, i) => {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.items.push({ o, i });
    else groups.push({ group: o.group, items: [{ o, i }] });
  });

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest["aria-label"]}
        className={`field flex items-center justify-between gap-2 text-left ${compact ? "py-1.5 text-xs" : ""} ${open ? "border-blue-700 ring-2 ring-blue-700 bg-white" : "hover:border-blue-400 hover:bg-white"}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected && selected.value ? "text-slate-800" : "text-slate-500"}`}>
          {selected ? selected.label : placeholder}
          {selected?.detail && !compact && <span className="ml-2 text-xs text-slate-400">{selected.detail}</span>}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={`h-4 w-4 shrink-0 text-blue-800 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1.5 min-w-56 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_20px_40px_-16px_rgba(30,46,85,0.35)]"
          onKeyDown={onKeyboard}
        >
          {searchable && all.length > 6 && (
            <div className="border-b border-blue-100 p-2">
              <input
                ref={inputRef}
                className="w-full rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
                placeholder="Buscar…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                aria-autocomplete="list"
                aria-controls={listId}
              />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" tabIndex={searchable && all.length > 6 ? -1 : 0} className="max-h-64 overflow-y-auto p-1.5 focus:outline-none">
            {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">Sin resultados</li>}
            {groups.map((g, gi) => (
              <li key={gi} role="presentation">
                {g.group && <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{g.group}</p>}
                <ul role="group">
                  {g.items.map(({ o, i }) => {
                    const isSelected = o.value === value;
                    return (
                      <li
                        key={o.value || "__empty"}
                        role="option"
                        aria-selected={isSelected}
                        data-index={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(o)}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ${o.disabled ? "cursor-not-allowed opacity-40" : ""} ${
                          isSelected ? "bg-blue-100 font-semibold text-blue-900" : active === i ? "bg-blue-50 text-blue-900" : "text-slate-700"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{o.label}</span>
                          {o.detail && <span className="block truncate text-xs font-normal text-slate-400">{o.detail}</span>}
                        </span>
                        {isSelected && (
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="h-4 w-4 shrink-0 text-blue-800"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 8.5l3 3 7-7" />
                          </svg>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
