import { NextResponse } from "next/server";
import { withPermission, readBody, notFound, errorResponse, forbidden, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { eventEditSchema } from "@/lib/modules/schedule/schemas";
import { updateEvent, deleteEvent, toPublicEvent, getEvent } from "@/lib/modules/schedule/service";
import { ownTypes } from "@/lib/modules/schedule/permissions";
import type { User } from "@prisma/client";

async function own(id: string, user: User) {
  const e = await getEvent(id);
  if (!e) return { error: notFound("Evento") };
  if (!user.personId || e.teacherId !== user.personId || !ownTypes(user.role).includes(e.type)) return { error: forbidden() };
  return { event: e };
}

export const PATCH = withPermission("schedule.own", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, eventEditSchema);
  if (error) return error;
  const r = await own(id, user);
  if (r.error) return r.error;
  if (!ownTypes(user.role).includes(data.type)) return forbidden();
  try {
    // Pay-related fields keep what coordination set; hours are recomputed from start/end.
    const event = await updateEvent(id, { ...data, teacherId: user.personId, moduleId: null, hours: null, hourlyRate: r.event.hourlyRate, payable: r.event.payable });
    await audit("schedule.update", { userId: user.id, entity: "Event", entityId: id, details: { scope: data.scope, own: true } });
    return NextResponse.json({ event: toPublicEvent(event) });
  } catch (e) {
    return errorResponse(e);
  }
});

export const DELETE = withPermission("schedule.own", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const r = await own(id, user);
  if (r.error) return r.error;
  const scope = new URL(req.url).searchParams.get("scope") === "series" ? "series" : "one";
  try {
    const n = await deleteEvent(id, scope);
    await audit("schedule.delete", { userId: user.id, entity: "Event", entityId: id, details: { scope, deleted: n, own: true } });
    return NextResponse.json({ deleted: n });
  } catch (e) {
    return errorResponse(e);
  }
});
