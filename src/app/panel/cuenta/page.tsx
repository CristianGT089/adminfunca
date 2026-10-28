"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { request, useSession } from "@/components/core/useSession";
import { Alert, PageHeader, Field } from "@/components/core/ui";

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
