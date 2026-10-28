import { NextResponse } from "next/server";
import { withPermission } from "@/lib/core/http";
import { listAssignees } from "@/lib/modules/schedule/service";

/** Teachers and professionals (psychology, internships) an entry can be assigned to. */
export const GET = withPermission(["schedule.view", "schedule.own"], async () => NextResponse.json({ assignees: await listAssignees() }));
