import { NextResponse } from "next/server";
import { readBody, withPermission, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { moduleSchema } from "@/lib/modules/academic/schemas";
import { createModule, listModules, toPublicModule } from "@/lib/modules/academic/service";

// Read permission of the module: whoever needs the dropdown (teachers, schedule) holds it.
export const GET = withPermission("modules.view", async (req) => {
  const active = new URL(req.url).searchParams.get("active") === "1";
  const modules = await listModules(active);
  return NextResponse.json({ modules: modules.map(toPublicModule) });
});

export const POST = withPermission("modules.manage", async (req, user) => {
  const { data, error } = await readBody(req, moduleSchema);
  if (error) return error;
  try {
    const academicModule = await createModule(data);
    await audit("modules.create", { userId: user.id, entity: "AcademicModule", entityId: academicModule.id, details: { name: academicModule.name, program: academicModule.program } });
    return NextResponse.json({ module: toPublicModule(academicModule) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
});
