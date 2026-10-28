"use client";

import { useState } from "react";
import RequestForm, { requestBody } from "@/components/psychology/RequestForm";

export default function RequestAppointment({ domains }: { domains: string[] }) {
  const [sent, setSent] = useState<{ email: string } | null>(null);

  if (sent) {
    return (
      <div className="card p-6 sm:p-8">
        <p className="eyebrow">Falta un paso</p>
        <h2 className="mt-2 font-heading text-2xl font-extrabold text-blue-900">Revise su correo</h2>
        <p className="mt-3 text-slate-600">
          Si los datos son correctos, enviamos un enlace a <strong>{sent.email}</strong>. Ábralo y presione «Confirmar» para que su solicitud llegue a Psicología.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          El enlace vence en 24 horas. Si no lo ve, revise la carpeta de correo no deseado. Si ya tiene una solicitud en curso o alcanzó el máximo de solicitudes del
          mes, no se envía un enlace nuevo: Psicología se comunicará con usted o puede acudir a la oficina de bienestar.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <RequestForm
        isPublic
        domains={domains}
        onSubmit={async (d) => {
          const res = await fetch("/api/public/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody(d)) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return data.error ?? "No se pudo enviar la solicitud. Intente de nuevo.";
          setSent(data);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return null;
        }}
      />
    </div>
  );
}
