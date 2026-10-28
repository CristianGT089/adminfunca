"use client";

import { useEffect, type ReactNode } from "react";

/** Page header: yellow eyebrow, title and main action on the right. */
export function PageHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title mt-1">{title}</h1>
        {text && <p className="mt-1 text-sm text-slate-500 max-w-2xl">{text}</p>}
      </div>
      {action && <div className="shrink-0 max-w-full min-w-0">{action}</div>}
    </div>
  );
}

export function Alert({ type = "error", children }: { type?: "error" | "ok" | "info"; children: ReactNode }) {
  const className = { error: "bg-red-50 text-red-700", ok: "bg-emerald-50 text-emerald-700", info: "bg-blue-50 text-blue-800" }[type];
  return (
    <p role={type === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${className}`}>
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-blue-200 px-4 py-8 text-center text-sm text-slate-400">{children}</p>;
}

export function Modal({ title, open, onClose, children, width = "max-w-lg" }: { title: string; open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-blue-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${width} max-h-[90vh] overflow-y-auto p-6 shadow-[0_30px_80px_-30px_rgba(19,28,55,0.6)]`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-heading text-xl font-bold text-blue-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-800">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, help, className = "" }: { label: string; children: ReactNode; help?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-slate-400">{help}</span>}
    </label>
  );
}

export const formatDate = (iso: string | null | undefined, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) })
    : "—";

// Labels shown in the interface for the Prisma enums.
export const ITEM_STATUS: Record<string, { text: string; className: string }> = {
  AVAILABLE: { text: "Disponible", className: "bg-emerald-100 text-emerald-700" },
  LOANED: { text: "Prestado", className: "bg-gold-100 text-gold-700" },
  MAINTENANCE: { text: "Mantenimiento", className: "bg-orange-100 text-orange-700" },
  RETIRED: { text: "Dado de baja", className: "bg-slate-100 text-slate-500" },
};

export const PERSON_TYPE: Record<string, string> = {
  STUDENT: "Estudiante",
  TEACHER: "Docente",
  STAFF: "Administrativo",
  EXTERNAL: "Externo",
};

export function StatusPill({ status }: { status: string }) {
  const s = ITEM_STATUS[status] ?? { text: status, className: "bg-slate-100 text-slate-500" };
  return <span className={`pill ${s.className}`}>{s.text}</span>;
}

/** Button that copies a text (for example, a temporary password) to the clipboard. */
export function CopyButton({ text }: { text: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text)} className="btn-soft px-3 py-1 text-xs">
      Copiar
    </button>
  );
}
