import { NextResponse } from "next/server";
import { withPermission, validationError, readBody, errorResponse, forbidden } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { eventSchema, rangeSchema } from "@/lib/modules/schedule/schemas";
import { createEvents, toPublicEvent, listEvents } from "@/lib/modules/schedule/service";
import { managedTypes } from "@/lib/modules/schedule/permissions";

export const GET = withPermission("schedule.view", async (req) => {
  const p = new URL(req.url).searchParams;
  const r = rangeSchema.safeParse({ from: p.get("from"), to: p.get("to"), teacherId: p.get("teacherId") || undefined, type: p.get("type") || undefined });
  if (!r.success) return validationError("Rango de fechas inválido");
  const events = await listEvents({ from: new Date(r.data.from), to: new Date(r.data.to), teacherId: r.data.teacherId, type: r.data.type });
  return NextResponse.json({ events: events.map(toPublicEvent) });
});

export const POST = withPermission(["schedule.manage", "schedule.fieldTrips"], async (req, user) => {
  const { data, error } = await readBody(req, eventSchema);
  if (error) return error;
  if (!managedTypes(user.role).includes(data.type)) return forbidden();
  try {
    const created = await createEvents(data, user.id);
    await audit("schedule.create", { userId: user.id, entity: "Event", entityId: created[0].id, details: { type: data.type, sessions: created.length, teacherId: data.teacherId } });
    return NextResponse.json({ events: created.map(toPublicEvent) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
});
