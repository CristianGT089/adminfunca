import { NextResponse } from "next/server";
import { readBody, withPermission, type IdParams, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { moduleSchema } from "@/lib/modules/academic/schemas";
import { toPublicModule, updateModule } from "@/lib/modules/academic/service";

export const PATCH = withPermission("modules.manage", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, moduleSchema);
  if (error) return error;
  try {
    const academicModule = await updateModule(id, data);
    await audit("modules.update", { userId: user.id, entity: "AcademicModule", entityId: id, details: { name: academicModule.name, active: academicModule.active } });
    return NextResponse.json({ module: toPublicModule(academicModule) });
  } catch (e) {
    return errorResponse(e);
  }
});
