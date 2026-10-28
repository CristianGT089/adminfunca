import { NextResponse } from "next/server";
import { withPermission, readBody, notFound, errorResponse, forbidden } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { hasPermission, type Permission } from "@/lib/core/permissions";
import { cancelSchema, scheduleSchema, feedbackSchema } from "@/lib/modules/psychology/schemas";
import { cancelRequest, createFollowUp, releaseRequest, scheduleRequest, recordFeedback, toPublicRequest, takeRequest } from "@/lib/modules/psychology/service";

type Ctx = { params: Promise<{ id: string; action: string }> };

// Each action requires its permission; cancelling can also be done by whoever registers requests.
const PERMISSION: Record<string, Permission[]> = {
  take: ["psychology.attend"],
  release: ["psychology.attend"],
  schedule: ["psychology.attend"],
  feedback: ["psychology.attend"],
  followUp: ["psychology.attend"],
  cancel: ["psychology.attend", "psychology.request"],
};

export const POST = withPermission(["psychology.attend", "psychology.request"], async (req, user, { params }: Ctx) => {
  const { id, action } = await params;
  const permissions = Object.hasOwn(PERMISSION, action) ? PERMISSION[action] : undefined;
  if (!permissions) return notFound("Acción");
  if (!hasPermission(user.role, permissions)) return forbidden();
  try {
    let result;
    let details: Record<string, string | boolean | null> = {};
    switch (action) {
      case "take":
        result = await takeRequest(id, user);
        break;
      case "release":
        result = await releaseRequest(id, user);
        break;
      case "schedule": {
        const { data, error } = await readBody(req, scheduleSchema);
        if (error) return error;
        result = await scheduleRequest(id, data, user);
        details = { startsAt: data.startsAt, modality: data.modality };
        break;
      }
      case "feedback": {
        const { data, error } = await readBody(req, feedbackSchema);
        if (error) return error;
        result = await recordFeedback(id, data, user);
        // Without the observation or the reason: the audit log does not store clinical data.
        details = { attendance: data.attendance, referral: data.referral };
        break;
      }
      case "cancel": {
        const { data, error } = await readBody(req, cancelSchema);
        if (error) return error;
        result = await cancelRequest(id, data.reason, user);
        break;
      }
      case "followUp":
        result = await createFollowUp(id, user);
        details = { previous: id };
        break;
    }
    await audit(`psychology.${action}`, { userId: user.id, entity: "ConsultationRequest", entityId: result!.id, details: { number: result!.number, status: result!.status, ...details } });
    return NextResponse.json({ request: toPublicRequest(result!, user) });
  } catch (e) {
    return errorResponse(e);
  }
});
