"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, request } from "@/components/core/useSession";
import { formatDate, Empty } from "@/components/core/ui";
import type { PublicLoan } from "@/lib/modules/inventory/service";
import type { Permission } from "@/lib/core/permissions";

type Summary = {
  items: { available: number; loaned: number; maintenance: number; retired: number; total: number };
  people: number;
  loans: { open: number; overdue: number; today: number };
};

type Shortcut = { href: string; title: string; text: string; permission: Permission; icon: string };

const SHORTCUTS: Shortcut[] = [
  { href: "/panel/inventario", title: "Entregar o recibir un elemento", text: "Registro de entregas y devoluciones con lector de código de barras.", permission: "inventory.loan", icon: "M4 7h16M4 7v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7M4 7l2-3h12l2 3M9 11h6" },
  { href: "/panel/inventario/elementos", title: "Elementos del inventario", text: "Consulta, creación y etiquetado de elementos.", permission: "inventory.view", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/panel/inventario/personas", title: "Personas", text: "Estudiantes, docentes y personal que reciben elementos.", permission: "inventory.people.view", icon: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
  { href: "/panel/inventario/historial", title: "Historial de préstamos", text: "Entregas y devoluciones registradas.", permission: "inventory.view", icon: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3" },
  { href: "/panel/mi-agenda", title: "Mi agenda", text: "Lo que tengo programado y lo que falta cerrar.", permission: "schedule.ownView", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 15l2 2 4-4" },
  { href: "/panel/psicologia", title: "Psicología", text: "Solicitudes de cita: registrar, tomar, programar y ver en qué va cada una.", permission: "psychology.view", icon: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" },
  { href: "/panel/agenda", title: "Agenda académica", text: "Clases, cursos, diplomados, prácticas y consultas. De aquí salen las horas de la nómina.", permission: "schedule.view", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" },
  { href: "/panel/docentes", title: "Docentes", text: "Perfil de cada docente y módulos que dicta.", permission: "teachers.view", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M2 8l10-5 10 5" },
  { href: "/panel/modulos", title: "Módulos académicos", text: "Asignaturas de cada programa, base de la agenda y la nómina.", permission: "modules.view", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/panel/nomina", title: "Horas y nómina", text: "Horas del mes por persona y tipo, revisión de requisitos y registro de pagos.", permission: "payroll.view", icon: "M3 5h18v14H3zM3 10h18M8 15h4" },
  { href: "/panel/usuarios", title: "Usuarios y roles", text: "Cuentas del personal y permisos por rol.", permission: "users.view", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
  { href: "/panel/auditoria", title: "Auditoría", text: "Bitácora de accesos y cambios.", permission: "audit.view", icon: "M9 5h6M9 9h6M9 13h4M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" },
  { href: "/panel/proyeccion", title: "Proyección", text: "Pantalla de Día de Muertos para el salón.", permission: "projection.view", icon: "M3 5h18v12H3zM8 21h8M12 17v4M10 8.5v5l4.5-2.5z" },
];

export default function HomePage() {
  const { session, can } = useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<PublicLoan[]>([]);
  const [psych, setPsych] = useState<{ pending: number; withoutFeedback: number } | null>(null);

  // Psychology: how many requests are waiting in the inbox and how many appointments are still to be closed.
  useEffect(() => {
    if (!session || !can("psychology.attend")) return;
    request<{ summary: { count: Record<string, number>; withoutFeedback: number } }>("/api/psychology/requests?status=PENDING").then(({ ok, data }) => {
      if (ok) setPsych({ pending: data.summary.count.PENDING ?? 0, withoutFeedback: data.summary.withoutFeedback });
    });
  }, [session, can]);

  useEffect(() => {
    if (!session || !can("inventory.view")) return;
    request<{ summary: Summary; recent: PublicLoan[] }>("/api/inventory/summary").then(({ ok, data }) => {
      if (!ok) return;
      setSummary(data.summary);
      setRecent(data.recent);
    });
  }, [session, can]);

  if (!session) return null;
  const shortcuts = SHORTCUTS.filter((a) => can(a.permission));

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 to-blue-800 px-6 py-8 sm:px-10 sm:py-10 text-white">
        <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-600/40 blur-2xl" />
        <div aria-hidden className="absolute right-24 -bottom-20 h-48 w-48 rounded-full bg-gold-500/20 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-gold-500/60 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-400">{session.roleName}</p>
            <h1 className="mt-3 font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">
              {session.name}
            </h1>
            <p className="mt-2 max-w-xl text-blue-200">
              {psych
                ? psych.pending > 0
                  ? `${psych.pending} solicitud${psych.pending === 1 ? "" : "es"} de cita esperando en la bandeja.`
                  : psych.withoutFeedback > 0
                    ? `${psych.withoutFeedback} cita${psych.withoutFeedback === 1 ? "" : "s"} sin retroalimentación.`
                    : "No hay solicitudes esperando."
                : summary
                ? summary.loans.overdue > 0
                  ? `${summary.loans.overdue} préstamo${summary.loans.overdue === 1 ? "" : "s"} con la devolución vencida.`
                  : `${summary.loans.open} elemento${summary.loans.open === 1 ? "" : "s"} prestado${summary.loans.open === 1 ? "" : "s"} en este momento.`
                : "Plataforma administrativa de FUNCA."}
            </p>
          </div>
          {psych && (
            <Link href="/panel/psicologia" className="btn-cta self-start sm:self-auto">
              Ir a la bandeja
            </Link>
          )}
          {!psych && can("inventory.loan") && (
            <Link href="/panel/inventario" className="btn-cta self-start sm:self-auto">
              Registrar entrega
            </Link>
          )}
        </div>
      </section>

      {summary && (
        <section aria-label="Resumen del inventario" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { v: summary.items.available, t: "Disponibles", c: "text-emerald-600" },
            { v: summary.items.loaned, t: "Prestados", c: "text-gold-700" },
            { v: summary.loans.overdue, t: "Vencidos", c: summary.loans.overdue ? "text-red-600" : "text-slate-400" },
            { v: summary.loans.today, t: "Entregas de hoy", c: "text-blue-800" },
          ].map((k) => (
            <div key={k.t} className="card-sm px-5 py-4">
              <p className={`font-heading text-3xl font-extrabold ${k.c}`}>{k.v}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k.t}</p>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="shortcuts">
        <p className="eyebrow">Módulos</p>
        <h2 id="shortcuts" className="mt-1 mb-4 font-heading text-xl font-bold text-blue-900">
          Accesos rápidos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((a) => (
            <Link key={a.href} href={a.href} className="card-action flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-800">
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={a.icon} />
                </svg>
              </span>
              <span>
                <span className="block font-heading font-semibold text-blue-900">{a.title}</span>
                <span className="block text-sm text-slate-500">{a.text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {can("inventory.view") && (
        <section aria-labelledby="recent">
          <p className="eyebrow">Movimientos</p>
          <h2 id="recent" className="mt-1 mb-4 font-heading text-xl font-bold text-blue-900">
            Últimos préstamos
          </h2>
          {recent.length === 0 ? (
            <Empty>Aún no hay préstamos registrados.</Empty>
          ) : (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Elemento</th>
                    <th>Persona</th>
                    <th>Entregado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="font-semibold text-blue-900">{p.item.name}</span>
                        <span className="block font-mono text-xs text-slate-400">{p.item.code}</span>
                      </td>
                      <td data-t="Persona">{p.person.fullName}</td>
                      <td data-t="Entregado" className="text-slate-500">{formatDate(p.deliveredAt)}</td>
                      <td data-t="Estado">
                        {p.returnedAt ? (
                          <span className="pill bg-slate-100 text-slate-500">Devuelto</span>
                        ) : p.overdue ? (
                          <span className="pill bg-red-100 text-red-700">Vencido</span>
                        ) : (
                          <span className="pill bg-gold-100 text-gold-700">Prestado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
