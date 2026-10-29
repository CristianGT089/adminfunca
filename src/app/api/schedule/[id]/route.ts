import { NextResponse } from "next/server";
import { withPermission, readBody, notFound, errorResponse, forbidden, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { eventEditSchema } from "@/lib/modules/schedule/schemas";
import { updateEvent, deleteEvent, toPublicEvent, getEvent } from "@/lib/modules/schedule/service";
import { managedTypes } from "@/lib/modules/schedule/permissions";

export const PATCH = withPermission(["schedule.manage", "schedule.fieldTrips"], async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, eventEditSchema);
  if (error) return error;
  const current = await getEvent(id);
  if (!current) return notFound("Evento");
  const types = managedTypes(user.role);
  if (!types.includes(current.type) || !types.includes(data.type)) return forbidden();
  try {
    const event = await updateEvent(id, data, (e) => types.includes(e.type));
    await audit("schedule.update", { userId: user.id, entity: "Event", entityId: id, details: { scope: data.scope, type: data.type } });
    return NextResponse.json({ event: toPublicEvent(event) });
  } catch (e) {
    return errorResponse(e);
  }
});

export const DELETE = withPermission(["schedule.manage", "schedule.fieldTrips"], async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const scope = new URL(req.url).searchParams.get("scope") === "series" ? "series" : "one";
  const current = await getEvent(id);
  if (!current) return notFound("Evento");
  const types = managedTypes(user.role);
  if (!types.includes(current.type)) return forbidden();
  try {
    const n = await deleteEvent(id, scope, (e) => types.includes(e.type));
    await audit("schedule.delete", { userId: user.id, entity: "Event", entityId: id, details: { scope, deleted: n } });
    return NextResponse.json({ deleted: n });
  } catch (e) {
    return errorResponse(e);
  }
});
