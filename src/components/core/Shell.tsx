"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Permission } from "@/lib/core/permissions";
import type { Session } from "./useSession";

export type MenuItem = { href: string; label: string; icon: string; permission?: Permission; exact?: boolean };
export type MenuGroup = { title: string; items: MenuItem[] };

/**
 * Frame of the administrative platform. Unlike the public site (white header) and the
 * internships platform (navy header on top), navigation here lives in a dark navy sidebar
 * with a gold stripe: it is immediately recognizable as the internal tool.
 */
export default function Shell({ session, menu, onLogout, children }: { session: Session; menu: MenuGroup[]; onLogout: () => void; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = menu
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || session.permissions.includes(i.permission)) }))
    .filter((g) => g.items.length > 0);
  const isActive = (i: MenuItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));
  const initial = session.name.trim().charAt(0).toUpperCase();

  const navigation = (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {visible.map((g) => (
        <div key={g.title}>
          <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400">{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(i) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium font-heading transition-colors ${
                    isActive(i) ? "bg-gold-500 text-blue-950 shadow-[0_8px_20px_-10px_rgba(251,186,0,0.8)]" : "text-blue-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={i.icon} />
                  </svg>
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500 font-heading text-sm font-bold text-blue-950">
        {initial}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold text-white">{session.name}</span>
        <span className="block truncate text-[11px] text-blue-300">{session.roleName}</span>
      </span>
      <button onClick={onLogout} title="Cerrar sesión" className="rounded-full px-2.5 py-1 text-xs font-medium text-blue-200 hover:bg-white/10 hover:text-white">
        Salir
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex sticky top-0 h-dvh flex-col gap-6 overflow-y-auto bg-blue-950 border-t-8 border-gold-500 px-4 py-5 text-white">
        <Link href="/panel" className="flex items-center gap-3 px-2" aria-label="Ir al inicio">
          <Image src="/funca-logo-blanco.png" alt="FUNCA" width={800} height={157} priority className="h-7 w-auto" />
          <span className="h-6 w-px bg-white/20" aria-hidden />
          <span className="font-heading text-[11px] font-bold uppercase tracking-[0.2em] text-gold-400">Admin</span>
        </Link>
        <div className="flex-1">{navigation}</div>
        <Link href="/panel/cuenta" className="px-3 text-xs text-blue-300 hover:text-white">
          Mi cuenta y contraseña
        </Link>
        {account}
      </aside>

      {/* Compact header (phone and tablet) */}
      <header className="lg:hidden sticky top-0 z-40 bg-blue-950 border-t-8 border-gold-500 px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <Link href="/panel" className="flex items-center gap-3" aria-label="Ir al inicio">
            <Image src="/funca-logo-blanco.png" alt="FUNCA" width={800} height={157} priority className="h-7 w-auto" />
            <span className="font-heading text-[11px] font-bold uppercase tracking-[0.2em] text-gold-400">Admin</span>
          </Link>
          <button onClick={() => setOpen((a) => !a)} aria-expanded={open} aria-label="Menú" className="rounded-full p-2 hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {open && (
          <div className="mt-4 flex flex-col gap-4 pb-2">
            {navigation}
            <Link href="/panel/cuenta" onClick={() => setOpen(false)} className="px-3 text-xs text-blue-300">
              Mi cuenta y contraseña
            </Link>
            {account}
          </div>
        )}
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl flex flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
