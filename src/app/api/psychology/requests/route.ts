import { NextResponse } from "next/server";
import { withPermission, readBody, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { hasPermission } from "@/lib/core/permissions";
import { REQUEST_STATUSES, requestSchema, type RequestStatus } from "@/lib/modules/psychology/schemas";
import { countByStatus, createRequest, listRequests, publicRequests } from "@/lib/modules/psychology/service";

export const GET = withPermission("psychology.view", async (req, user) => {
  const p = new URL(req.url).searchParams;
  const status = REQUEST_STATUSES.includes(p.get("status") as RequestStatus) ? (p.get("status") as RequestStatus) : undefined;
  const mine = p.get("mine") === "1";
  const [year, month] = (p.get("month") ?? "").split("-").map(Number);
  const list = await listRequests({
    status,
    open: p.get("open") === "1",
    assignedToId: mine ? user.id : undefined,
    q: p.get("q") ?? undefined,
    month: year && month ? { year, month } : undefined,
  });
  const professional = hasPermission(user.role, "psychology.attend");
  return NextResponse.json({ requests: await publicRequests(list, user), summary: await countByStatus(professional ? user.id : undefined) });
});

/** Request registered by the staff (assistant, coordinations, psychology). */
export const POST = withPermission("psychology.request", async (req, user) => {
  const { data, error } = await readBody(req, requestSchema);
  if (error) return error;
  try {
    // Internal registrations are never silently blocked (that only happens on the public link).
    const { request } = await createRequest(data, { origin: "INTERNAL", registeredById: user.id });
    if (!request) throw new Error("Internal request unexpectedly blocked");
    await audit("psychology.request", { userId: user.id, entity: "ConsultationRequest", entityId: request.id, details: { number: request.number, origin: "INTERNAL" } });
    const [publicRequest] = await publicRequests([request], user);
    return NextResponse.json({ request: publicRequest }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
});
