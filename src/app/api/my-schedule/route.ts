import { NextResponse } from "next/server";
import { withPermission, validationError, readBody, errorResponse, forbidden } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { eventSchema, rangeSchema } from "@/lib/modules/schedule/schemas";
import { createEvents, toPublicEvent, listEvents } from "@/lib/modules/schedule/service";
import { ownTypes } from "@/lib/modules/schedule/permissions";

const noPerson = () => NextResponse.json({ error: "Su cuenta no está vinculada a una persona. Pida al administrador que la vincule en Usuarios y roles." }, { status: 409 });

/** Entries under the name of the person linked to the account. */
export const GET = withPermission("schedule.ownView", async (req, user) => {
  if (!user.personId) return noPerson();
  const p = new URL(req.url).searchParams;
  const r = rangeSchema.safeParse({ from: p.get("from"), to: p.get("to") });
  if (!r.success) return validationError("Rango de fechas inválido");
  const events = await listEvents({ from: new Date(r.data.from), to: new Date(r.data.to), teacherId: user.personId });
  return NextResponse.json({ events: events.map(toPublicEvent), types: ownTypes(user.role) });
});

export const POST = withPermission("schedule.own", async (req, user) => {
  if (!user.personId) return noPerson();
  const { data, error } = await readBody(req, eventSchema);
  if (error) return error;
  if (!ownTypes(user.role).includes(data.type)) return forbidden();
  try {
    // Pay-related fields are not the person's to set: hours come from start/end and the rate is
    // their base rate (coordination adjusts it from the general schedule).
    const created = await createEvents({ ...data, teacherId: user.personId, moduleId: null, byShift: null, hours: null, hourlyRate: null, payable: true }, user.id);
    await audit("schedule.create", { userId: user.id, entity: "Event", entityId: created[0].id, details: { type: data.type, sessions: created.length, own: true } });
    return NextResponse.json({ events: created.map(toPublicEvent) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
});
