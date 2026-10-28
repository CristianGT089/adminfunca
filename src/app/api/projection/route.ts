import { NextResponse } from "next/server";
import { readBody, withPermission } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { projectionSchema } from "@/lib/modules/projection/schemas";
import { getProjection, saveProjection } from "@/lib/modules/projection/service";

// The screen polls this every few seconds to pick up changes to the playlist.
export const GET = withPermission("projection.manage", async () => {
  return NextResponse.json({ projection: await getProjection() });
});

export const PUT = withPermission("projection.manage", async (req, user) => {
  const { data, error } = await readBody(req, projectionSchema);
  if (error) return error;
  const projection = await saveProjection(data, user);
  await audit("projection.update", { userId: user.id, entity: "Projection", details: { shuffle: data.shuffle } });
  return NextResponse.json({ projection });
});
