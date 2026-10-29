"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field, formatDate } from "@/components/core/ui";

type OpenSession = { id: string; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null; current: boolean };

/** "Chrome · Windows" from the user agent; enough to recognize one's own devices. */
function device(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

function Sessions() {
  const [sessions, setSessions] = useState<OpenSession[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    () =>
      request<{ sessions: OpenSession[] }>("/api/auth/sessions").then(({ ok, data }) => {
        if (ok) setSessions(data.sessions);
      }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function close(id?: string) {
    const { ok, data } = await request<{ closed: number }>(`/api/auth/sessions${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: "DELETE" });
    if (ok) setMessage(data.closed === 1 ? "Se cerró 1 sesión." : `Se cerraron ${data.closed} sesiones.`);
    load();
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0;
  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Sesiones abiertas</p>
          <p className="mt-1 text-sm text-slate-500">Las sesiones se cierran solas tras 2 horas sin actividad o 8 horas desde que entró.</p>
        </div>
        {others > 0 && (
          <button type="button" onClick={() => close()} className="btn-secondary">
            Cerrar las demás sesiones
          </button>
        )}
      </div>
      {message && <Alert type="ok">{message}</Alert>}
      {sessions === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>IP</th>
              <th>Inicio</th>
              <th>Última actividad</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  {device(s.userAgent)}
                  {s.current && <span className="pill ml-2 bg-emerald-100 text-emerald-700">Esta sesión</span>}
                </td>
                <td data-t="IP" className="font-mono text-xs text-slate-500">{s.ip ?? "—"}</td>
                <td data-t="Inicio">{formatDate(s.createdAt)}</td>
                <td data-t="Última actividad">{formatDate(s.lastSeenAt)}</td>
                <td className="text-right">
                  {!s.current && (
                    <button type="button" onClick={() => close(s.id)} className="btn-danger px-3 py-1 text-xs">
                      Cerrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Content() {
  const { session } = useSession();
  const router = useRouter();
  const first = useSearchParams().get("primera") === "1";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("La confirmación no coincide con la nueva contraseña");
    setLoading(true);
    const { ok, data } = await request("/api/auth/change-password", { method: "POST", json: { current, next } });
    setLoading(false);
    if (!ok) return setError(data.error ?? "No se pudo cambiar la contraseña");
    setOk(true);
    setTimeout(() => router.replace("/panel"), 900);
  }

  return (
    <>
      <PageHeader eyebrow="Mi cuenta" title={first ? "Definir contraseña" : "Cambiar contraseña"} text={first ? "Ingresó con una contraseña temporal. Defina una propia para continuar." : undefined} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={onSubmit} className="card p-6 flex flex-col gap-4 max-w-md">
          <Field label="Contraseña actual">
            <input type="password" autoComplete="current-password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </Field>
          <Field label="Nueva contraseña" help="Mínimo 10 caracteres, con letras y números.">
            <input type="password" autoComplete="new-password" className="field" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirmar nueva contraseña">
            <input type="password" autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          {ok && <Alert type="ok">Contraseña actualizada.</Alert>}
          <button type="submit" disabled={loading || !current || !next || !confirm} className="btn-cta self-start">
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
        {session && (
          <aside className="card-sm p-5 text-sm self-start">
            <p className="eyebrow">Tu cuenta</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-slate-500">Nombre</dt>
              <dd className="font-semibold text-blue-900">{session.name}</dd>
              <dt className="text-slate-500">Usuario</dt>
              <dd className="font-mono">{session.username}</dd>
              <dt className="text-slate-500">Rol</dt>
              <dd>{session.roleName}</dd>
            </dl>
          </aside>
        )}
      </div>
      {!first && <Sessions />}
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
