import { NextResponse } from "next/server";
import { withPermission, readBody, notFound, errorResponse, forbidden, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { closingSchema, type EventType } from "@/lib/modules/schedule/schemas";
import { closeEvent, toPublicEvent, getEvent } from "@/lib/modules/schedule/service";
import { managedTypes } from "@/lib/modules/schedule/permissions";

/** Closing of an activity: recorded by whoever manages it or by the person in charge. */
export const POST = withPermission(["schedule.manage", "schedule.fieldTrips", "schedule.own"], async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, closingSchema);
  if (error) return error;
  const current = await getEvent(id);
  if (!current) return notFound("Evento");
  const allowed = (e: { teacherId: string | null; type: string }) => (!!user.personId && e.teacherId === user.personId) || managedTypes(user.role).includes(e.type as EventType);
  if (!allowed(current)) return forbidden();
  try {
    const event = await closeEvent(id, data, user.id, allowed);
    await audit("schedule.close", { userId: user.id, entity: "Event", entityId: id, details: { completion: data.completion } });
    return NextResponse.json({ event: toPublicEvent(event) });
  } catch (e) {
    return errorResponse(e);
  }
});
