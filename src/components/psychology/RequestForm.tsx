"use client";

import { useState } from "react";
import { Alert, Field } from "@/components/core/ui";
import { MODALITIES, MODALITY_NAME } from "@/lib/modules/schedule/schemas";
import { CAMPUSES, DOCUMENT_TYPES } from "@/lib/modules/inventory/schemas";
import { MONTHLY_LIMIT, REQUESTER_TYPE_NAME, REQUESTER_TYPES } from "@/lib/modules/psychology/schemas";

export type RequestFormData = {
  requesterType: (typeof REQUESTER_TYPES)[number];
  firstNames: string;
  lastNames: string;
  documentType: (typeof DOCUMENT_TYPES)[number];
  document: string;
  phone: string;
  email: string;
  program: string;
  campus: string;
  preferredModality: string;
  availability: string;
  reason: string;
  acceptsPolicy: boolean;
};

const EMPTY: RequestFormData = {
  requesterType: "STUDENT",
  firstNames: "",
  lastNames: "",
  documentType: "CC",
  document: "",
  phone: "",
  email: "",
  program: "",
  campus: "",
  preferredModality: "",
  availability: "",
  reason: "",
  acceptsPolicy: false,
};

/** Body for the API: empty values to null. */
export function requestBody(d: RequestFormData) {
  return { ...d, program: d.program || null, campus: d.campus || null, preferredModality: d.preferredModality || null, availability: d.availability || null, reason: d.reason || null };
}

/**
 * Data of an appointment request with Psychology. Used by the public link (the student or the
 * permanent staff fill in their data) and by the administrative staff from the platform.
 */
export default function RequestForm({
  isPublic,
  domains = [],
  onSubmit,
  onCancel,
}: {
  isPublic: boolean;
  domains?: string[];
  onSubmit: (d: RequestFormData) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<RequestFormData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = <K extends keyof RequestFormData>(k: K, v: RequestFormData[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.acceptsPolicy) return setError("Debe aceptar la política de tratamiento de datos");
    setSending(true);
    setError(null);
    const err = await onSubmit(f);
    setSending(false);
    if (err) setError(err);
  }

  const who = isPublic ? "usted" : "la persona";
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="field-label">{isPublic ? "Usted es" : "La cita es para"}</span>
        <div className="flex flex-wrap gap-1.5">
          {REQUESTER_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => set("requesterType", t)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${f.requesterType === t ? "border-blue-800 bg-blue-800 text-white" : "border-blue-200 bg-white text-slate-600 hover:bg-blue-50"}`}>
              {REQUESTER_TYPE_NAME[t]}
            </button>
          ))}
        </div>
      </div>

      <Field label="Nombres">
        <input className="field" required maxLength={80} autoComplete={isPublic ? "given-name" : "off"} value={f.firstNames} onChange={(e) => set("firstNames", e.target.value)} />
      </Field>
      <Field label="Apellidos">
        <input className="field" required maxLength={80} autoComplete={isPublic ? "family-name" : "off"} value={f.lastNames} onChange={(e) => set("lastNames", e.target.value)} />
      </Field>
      <div className="grid grid-cols-[6rem_1fr] gap-2 sm:col-span-2 sm:grid-cols-[7rem_1fr_1fr] sm:gap-4">
        <Field label="Tipo">
          <select className="field" value={f.documentType} onChange={(e) => set("documentType", e.target.value as RequestFormData["documentType"])}>
            {DOCUMENT_TYPES.filter((t) => t !== "NIT").map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Número de documento">
          <input className="field" required inputMode="numeric" maxLength={30} value={f.document} onChange={(e) => set("document", e.target.value)} />
        </Field>
        <Field label="Teléfono / WhatsApp" className="col-span-2 sm:col-span-1">
          <input className="field" required type="tel" maxLength={30} autoComplete={isPublic ? "tel" : "off"} value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>
      <Field
        label={isPublic ? "Correo institucional" : "Correo"}
        className="sm:col-span-2"
        help={isPublic ? `Le enviaremos un enlace para confirmar la solicitud${domains.length ? ` (correo @${domains.join(" o @")})` : ""}.` : "Allí le llegará la confirmación de la cita."}
      >
        <input className="field" required type="email" maxLength={120} autoComplete={isPublic ? "email" : "off"} value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={domains[0] ? `nombre@${domains[0]}` : undefined} />
      </Field>
      <Field label={f.requesterType === "STUDENT" ? "Programa" : "Área o programa"}>
        <input className="field" maxLength={120} value={f.program} onChange={(e) => set("program", e.target.value)} />
      </Field>
      <Field label="Sede">
        <select className="field" value={f.campus} onChange={(e) => set("campus", e.target.value)}>
          <option value="">Sin preferencia</option>
          {CAMPUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <span className="field-label">Modalidad preferida</span>
        <div className="flex flex-wrap gap-1.5">
          {[["", "Me da igual"] as const, ...MODALITIES.map((m) => [m, MODALITY_NAME[m]] as const)].map(([v, t]) => (
            <button key={v || "x"} type="button" onClick={() => set("preferredModality", v)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${f.preferredModality === v ? "border-blue-800 bg-blue-800 text-white" : "border-blue-200 bg-white text-slate-600 hover:bg-blue-50"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <Field label="¿Cuándo le queda bien?" className="sm:col-span-2" help="Días y franjas en que la psicóloga puede llamarle o atenderle.">
        <input className="field" maxLength={300} value={f.availability} onChange={(e) => set("availability", e.target.value)} placeholder="Ej. martes y jueves en la tarde, después de las 2" />
      </Field>
      <Field label="Motivo (opcional)" className="sm:col-span-2" help={`Si ${who} quiere, cuente brevemente el motivo. Solo lo leen las psicólogas y se guarda cifrado.`}>
        <textarea className="field" rows={3} maxLength={1000} value={f.reason} onChange={(e) => set("reason", e.target.value)} />
      </Field>

      <label className="sm:col-span-2 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-800" checked={f.acceptsPolicy} onChange={(e) => set("acceptsPolicy", e.target.checked)} />
        <span>
          {isPublic ? "Autorizo" : "La persona autoriza"} a FUNCA a tratar estos datos, incluidos datos sensibles de salud, para gestionar la atención psicológica, según la{" "}
          <a href="/privacidad" target="_blank" className="font-semibold text-blue-800 underline">
            política de tratamiento de datos
          </a>
          .
        </span>
      </label>

      {isPublic && <p className="sm:col-span-2 text-xs text-slate-500">Cada persona puede tener hasta {MONTHLY_LIMIT} citas realizadas al mes (las citas a las que no asiste no cuentan). La psicóloga se comunicará con usted para acordar el día y la hora.</p>}

      {error && (
        <div className="sm:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button type="submit" disabled={sending} className="btn-cta">
          {sending ? "Enviando..." : isPublic ? "Solicitar cita" : "Registrar solicitud"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
