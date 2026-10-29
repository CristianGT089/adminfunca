"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Shell, { type MenuGroup } from "@/components/core/Shell";
import { NoAccess } from "@/components/core/ui";
import { useSession } from "@/components/core/useSession";

// Task-based menu. `permission` is the module's READ permission: it decides who sees the item and
// who can open the screen (by URL too); the server checks it again on every endpoint. One item is
// gated by a write permission on purpose: "Entregar / recibir" is only actions (inventory.loan).
const MENU: MenuGroup[] = [
  {
    title: "General",
    items: [{ href: "/panel", label: "Inicio", exact: true, icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" }],
  },
  {
    title: "Inventario",
    items: [
      { href: "/panel/inventario", label: "Entregar / recibir", exact: true, permission: "inventory.loan", icon: "M4 7h16M4 7v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7M4 7l2-3h12l2 3M9 11h6" },
      { href: "/panel/inventario/elementos", label: "Elementos", permission: "inventory.view", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
      { href: "/panel/inventario/personas", label: "Personas", permission: "inventory.people.view", icon: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6" },
      { href: "/panel/inventario/historial", label: "Historial", permission: "inventory.view", icon: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3" },
    ],
  },
  {
    title: "Mi trabajo",
    items: [
      { href: "/panel/mi-agenda", label: "Mi agenda", permission: "schedule.ownView", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 15l2 2 4-4" },
      { href: "/panel/psicologia", label: "Psicología", permission: "psychology.view", icon: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" },
    ],
  },
  {
    title: "Coordinación académica",
    items: [
      { href: "/panel/agenda", label: "Agenda", permission: "schedule.view", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" },
      { href: "/panel/docentes", label: "Docentes", permission: "teachers.view", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M2 8l10-5 10 5" },
      { href: "/panel/modulos", label: "Módulos académicos", permission: "modules.view", icon: "M4 6h16M4 12h16M4 18h10" },
      { href: "/panel/nomina", label: "Horas y nómina", permission: "payroll.view", icon: "M3 5h18v14H3zM3 10h18M8 15h4" },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/panel/usuarios", label: "Usuarios y roles", permission: "users.view", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
      { href: "/panel/auditoria", label: "Auditoría", permission: "audit.view", icon: "M9 5h6M9 9h6M9 13h4M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" },
    ],
  },
  {
    title: "Eventos",
    items: [
      { href: "/panel/proyeccion", label: "Proyección", permission: "projection.view", icon: "M3 5h18v12H3zM8 21h8M12 17v4M10 8.5v5l4.5-2.5z" },
    ],
  },
];

/** Permission required by the screen at `pathname` (the most specific menu item that matches it). */
function requiredPermission(pathname: string) {
  const matches = MENU.flatMap((g) => g.items).filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/")));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.permission;
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { session, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Temporary password: nothing else can be used until it is changed.
  useEffect(() => {
    if (session?.mustChangePassword && pathname !== "/panel/cuenta") router.replace("/panel/cuenta?primera=1");
  }, [session, pathname, router]);

  const required = requiredPermission(pathname);

  if (!session) return <div className="min-h-dvh grid place-items-center text-slate-500 text-sm">Cargando...</div>;

  return (
    <Shell session={session} menu={MENU} onLogout={logout}>
      {/* Opened by URL without the read permission: a clear message instead of an empty screen. */}
      {required && !session.permissions.includes(required) ? <NoAccess /> : children}
    </Shell>
  );
}
