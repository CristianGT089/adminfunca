import { NextResponse } from "next/server";
import { withPermission, validationError } from "@/lib/core/http";
import { getPayroll } from "@/lib/modules/payroll/service";
import { readMonth } from "@/lib/modules/payroll/schemas";

/** Hours, amounts and review status of the month. */
export const GET = withPermission("payroll.view", async (req) => {
  const m = readMonth(req);
  if (!m) return validationError("Indique año y mes (1-12)");
  return NextResponse.json(await getPayroll(m.year, m.month));
});
