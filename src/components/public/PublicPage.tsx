import Image from "next/image";
import type { ReactNode } from "react";

/** Frame of the pages without a session (appointment request, data policy). */
export default function PublicPage({ eyebrow, title, text, children }: { eyebrow: string; title: string; text?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="relative overflow-hidden bg-blue-950 border-t-8 border-gold-500 px-4 pt-6 pb-24 sm:px-8 text-white">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-800/60 blur-3xl" />
        <div aria-hidden className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-gold-500/15 blur-3xl" />
        <div className="relative mx-auto max-w-3xl">
          <Image src="/funca-logo-blanco.png" alt="FUNCA" width={800} height={157} priority className="h-9 w-auto" />
          <p className="mt-8 inline-flex rounded-full border border-gold-500/60 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-400">{eyebrow}</p>
          <h1 className="mt-3 font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
          {text && <div className="mt-2 max-w-2xl text-blue-200">{text}</div>}
        </div>
      </header>
      <main className="relative -mt-16 px-4 pb-12 sm:px-8">
        <div className="mx-auto max-w-3xl">{children}</div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-slate-400">Fundación Escuela de Capacitación Colombia · FUNCA</p>
      </main>
    </div>
  );
}
