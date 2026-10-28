"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo iniciar sesión");
      return;
    }
    const data = await res.json();
    router.push(data.mustChangePassword ? "/panel/cuenta?primera=1" : "/panel");
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr] bg-[var(--background)]">
      {/* Cover: navy darker than the internships site and a gold stripe on top, the administrative platform's brand. */}
      <section className="relative overflow-hidden bg-blue-950 text-white px-6 py-8 sm:px-12 lg:py-10 flex flex-col justify-between gap-6 lg:gap-8 border-t-8 border-gold-500">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-800/60 blur-3xl" />
        <div aria-hidden className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Image src="/funca-logo-blanco.png" alt="FUNCA" width={800} height={157} priority className="h-10 sm:h-12 w-auto" />
          <span className="h-8 w-px bg-white/20" aria-hidden />
          <span className="font-heading text-sm font-bold uppercase tracking-[0.2em] text-gold-400">Administrativo</span>
        </div>
        <div className="relative max-w-lg">
          <p className="inline-flex rounded-full border border-gold-500/60 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-400">
            Uso interno · personal administrativo
          </p>
          <h1 className="mt-4 font-heading text-4xl xl:text-5xl font-extrabold leading-[1.05] tracking-tight short:text-3xl">
            Plataforma de gestión administrativa
          </h1>
          <p className="mt-3 text-blue-200 text-lg short:text-base">
            Inventario, entregas y devoluciones, nómina docente y herramientas de cada coordinación según su rol.
          </p>
          <ul className="mt-5 hidden sm:flex short:hidden flex-col gap-2 text-sm text-blue-100">
            {["Registro de inventario con lector de códigos de barras", "Acceso por rol y permisos", "Auditoría de todas las operaciones"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-400" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-blue-300">Fundación Escuela de Capacitación Colombia</p>
      </section>

      <section className="flex items-center justify-center px-4 py-8 sm:px-8 short:py-4">
        <form onSubmit={onSubmit} className="card w-full max-w-sm p-7 sm:p-8 short:py-6 shadow-[0_24px_60px_-30px_rgba(30,46,85,0.45)]">
          <p className="eyebrow">Plataforma administrativa</p>
          <h2 className="mt-2 font-heading text-2xl short:text-xl font-extrabold text-blue-900">Inicio de sesión</h2>
          <p className="mt-1 mb-6 short:mb-4 text-sm text-slate-500">Ingrese el usuario y la contraseña asignados por el administrador.</p>

          <label htmlFor="usuario" className="field-label">
            Usuario
          </label>
          <input id="usuario" autoComplete="username" className="field mb-4" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />

          <label htmlFor="password" className="field-label">
            Contraseña
          </label>
          <input id="password" type="password" autoComplete="current-password" className="field mb-5" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || !username || !password} className="btn-cta w-full py-3">
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
          <p className="mt-5 short:mt-3 text-center text-xs text-slate-400">Para restablecer la contraseña, contacte al administrador del sistema.</p>
        </form>
      </section>
    </div>
  );
}
