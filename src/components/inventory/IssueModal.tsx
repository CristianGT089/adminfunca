"use client";

import { useState } from "react";
import { request } from "@/components/core/useSession";
import { Alert, Field, formatDate, Modal } from "@/components/core/ui";
import type { PublicIssue, PublicLoan } from "@/lib/modules/inventory/service";
import { ISSUE_TYPES } from "@/lib/modules/inventory/schemas";

export const ISSUE_TYPE_NAME: Record<string, string> = {
  DEFECT: "Lo recibió con defecto",
  MISSING_PART: "Falta una parte o accesorio",
  DAMAGED_IN_USE: "Se dañó en uso",
  OTHER: "Otra",
};

/** "12 min ago", "2 h 5 min later", "3 days later". */
export function timeSinceDelivery(minutes: number): string {
  if (minutes < 60) return `${minutes} min después de la entrega`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ${minutes % 60} min después de la entrega`;
  const days = Math.floor(minutes / (60 * 24));
  return `${days} día${days === 1 ? "" : "s"} después de la entrega`;
}

/** An issue reported very soon after delivery suggests the damage was there before. */
export const isEarly = (minutes: number) => minutes <= 30;

export function IssueList({ issues }: { issues: PublicIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {issues.map((n) => (
        <li key={n.id} className={`rounded-lg px-2 py-1 text-xs ${isEarly(n.minutesSinceDelivery) ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}>
          <span className="font-semibold">{ISSUE_TYPE_NAME[n.type] ?? n.type}</span> · {timeSinceDelivery(n.minutesSinceDelivery)}
          <span className="block text-slate-600">{n.description}</span>
        </li>
      ))}
    </ul>
  );
}

/** Dialog to register what the person reports about the item after receiving it. */
export default function IssueModal({ loan, onClose, onDone }: { loan: PublicLoan | null; onClose: () => void; onDone: (text: string) => void }) {
  return (
    <Modal title="Registrar novedad" open={!!loan} onClose={onClose}>
      {loan && <Form key={loan.id} loan={loan} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function Form({ loan, onClose, onDone }: { loan: PublicLoan; onClose: () => void; onDone: (text: string) => void }) {
  const [type, setType] = useState<string>("DEFECT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Computed once when the dialog opens (the server computes it again when saving).
  const [minutes] = useState(() => Math.max(0, Math.round((Date.now() - new Date(loan.deliveredAt).getTime()) / 60000)));

  async function confirm() {
    setLoading(true);
    const { ok, data } = await request(`/api/inventory/loans/${loan.id}/issues`, { method: "POST", json: { type, description } });
    setLoading(false);
    if (!ok) return setError(data.error ?? "No se pudo registrar la novedad");
    onDone(`Novedad registrada sobre ${loan.item.name} (${timeSinceDelivery(minutes)}).`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-sm p-4 bg-blue-50/50">
        <p className="font-heading font-bold text-blue-900">{loan.item.name}</p>
        <p className="text-sm text-slate-600">
          Entregado a <strong>{loan.person.fullName}</strong> el {formatDate(loan.deliveredAt)}
        </p>
        <p className={`mt-1 text-sm font-semibold ${isEarly(minutes) ? "text-red-700" : "text-slate-600"}`}>
          Se reporta {timeSinceDelivery(minutes)}
          {isEarly(minutes) && " · reporte temprano: el daño es previo a la entrega"}
        </p>
      </div>
      <Field label="Qué pasó">
        <div className="flex flex-wrap gap-2">
          {ISSUE_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`btn px-4 py-2 ${type === t ? "bg-blue-800 text-white" : "bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>
              {ISSUE_TYPE_NAME[t]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Descripción" help="Descripción del estado del elemento según la persona que lo recibió.">
        <textarea className="field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
      </Field>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <button type="button" onClick={confirm} disabled={loading || description.trim().length < 3} className="btn-cta">
          Guardar novedad
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  );
}
