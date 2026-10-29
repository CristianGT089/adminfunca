import { NextResponse } from "next/server";
import { withPermission, notFound, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { hasPermission } from "@/lib/core/permissions";
import { getRequest, publicRequests } from "@/lib/modules/psychology/service";

export const GET = withPermission("psychology.view", async (_req, user, { params }: IdParams) => {
  const { id } = await params;
  const r = await getRequest(id);
  if (!r) return notFound("Solicitud");
  // Viewing contact details and reason is recorded in the audit log.
  if (hasPermission(user.role, "psychology.attend")) await audit("psychology.view", { userId: user.id, entity: "ConsultationRequest", entityId: id });
  const [request] = await publicRequests([r], user);
  return NextResponse.json({ request });
});
