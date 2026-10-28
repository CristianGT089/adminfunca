"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/core/ui";

/** Confirmation requires pressing the button: that way an antivirus that opens the link does not confirm it on its own. */
export default function ConfirmRequest({ token }: { token: string }) {
  const [state, setState] = useState<"ready" | "sending" | "done">("ready");
  const [result, setResult] = useState<{ number: number; firstNames: string } | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "El enlace está incompleto. Ábralo de nuevo desde su correo.");

  async function confirm() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/public/appointments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState("ready");
      return setError(data.error ?? "No se pudo confirmar");
    }
    setResult(data);
    setState("done");
  }

  return (
    <div className="card p-6 sm:p-8">
      {state === "done" && result ? (
        <>
          <p className="eyebrow">Solicitud #{result.number}</p>
          <h2 className="mt-2 font-heading text-2xl font-extrabold text-blue-900">¡Listo, {result.firstNames}!</h2>
          <p className="mt-3 text-slate-600">Su solicitud ya está en Psicología. Una psicóloga se comunicará con usted por teléfono o correo para acordar el día y la hora de la cita.</p>
        </>
      ) : (
        <>
          <h2 className="font-heading text-2xl font-extrabold text-blue-900">Un clic más</h2>
          <p className="mt-2 text-slate-600">Confirme que usted hizo la solicitud de cita con Psicología.</p>
          {error && (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={confirm} disabled={!token || state === "sending"} className="btn-cta">
              {state === "sending" ? "Confirmando..." : "Confirmar solicitud"}
            </button>
            {error && (
              <Link href="/solicitar-cita" className="btn-secondary">
                Hacer una nueva solicitud
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
