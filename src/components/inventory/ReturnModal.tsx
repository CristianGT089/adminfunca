"use client";

import { useState } from "react";
import { request } from "@/components/core/useSession";
import { Alert, Field, formatDate, Modal } from "@/components/core/ui";
import type { PublicLoan } from "@/lib/modules/inventory/service";
import { RETURN_CONDITIONS } from "@/lib/modules/inventory/schemas";

/** Dialog to register the return of an open loan. */
export default function ReturnModal({ loan, onClose, onDone }: { loan: PublicLoan | null; onClose: () => void; onDone: (text: string) => void }) {
  return (
    <Modal title="Registrar devolución" open={!!loan} onClose={onClose}>
      {/* `key` mounts a clean form for each loan. */}
      {loan && <Form key={loan.id} loan={loan} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function Form({ loan, onClose, onDone }: { loan: PublicLoan; onClose: () => void; onDone: (text: string) => void }) {
  const [condition, setCondition] = useState<string>("GOOD");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setLoading(true);
    const { ok, data } = await request(`/api/inventory/loans/${loan.id}/return`, { method: "POST", json: { returnCondition: condition, returnNote: note || null } });
    setLoading(false);
    if (!ok) return setError(data.error ?? "No se pudo registrar la devolución");
    onDone(`Recibido: ${loan.item.name} de ${loan.person.fullName}.`);
  }

  return (
        <div className="flex flex-col gap-4">
          <div className="card-sm p-4 bg-blue-50/50">
            <p className="font-heading font-bold text-blue-900">{loan.item.name}</p>
            <p className="text-sm text-slate-600">
              Prestado a <strong>{loan.person.fullName}</strong> el {formatDate(loan.deliveredAt)}
            </p>
            {loan.notes && <p className="mt-1 text-xs text-slate-500">{loan.notes}</p>}
          </div>
          <Field label="Estado en que se recibe">
            <div className="flex flex-wrap gap-2">
              {RETURN_CONDITIONS.map((c) => (
                <button key={c} type="button" onClick={() => setCondition(c)} className={`btn px-4 py-2 ${condition === c ? "bg-blue-800 text-white" : "bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>
                  {c === "GOOD" ? "Bueno" : c === "DAMAGED" ? "Dañado" : "Incompleto"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Nota (opcional)" help={condition === "DAMAGED" ? "El elemento pasará a Mantenimiento." : undefined}>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <button type="button" onClick={confirm} disabled={loading} className="btn-cta">
              Confirmar devolución
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
  );
}
