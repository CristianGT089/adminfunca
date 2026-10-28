import { NextResponse } from "next/server";
import { withPermission, readBody, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { periodActionSchema } from "@/lib/modules/payroll/schemas";
import { periodAction } from "@/lib/modules/payroll/service";

/** Moves the month's status forward or back (review, approval). */
export const POST = withPermission("payroll.manage", async (req, user) => {
  const { data, error } = await readBody(req, periodActionSchema);
  if (error) return error;
  try {
    const p = await periodAction(data.year, data.month, data.action, user.id, data.notes);
    await audit(`payroll.${data.action}`, { userId: user.id, entity: "PayrollPeriod", entityId: p.id, details: { year: data.year, month: data.month, status: p.status } });
    return NextResponse.json({ status: p.status });
  } catch (e) {
    return errorResponse(e);
  }
});
