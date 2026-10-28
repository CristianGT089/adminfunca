import { NextResponse } from "next/server";
import { withPermission, validationError } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { EVENT_TYPE_NAME } from "@/lib/modules/schedule/schemas";
import { csvReport } from "@/lib/modules/payroll/service";
import { readMonth } from "@/lib/modules/payroll/schemas";

/** Month report (hours by type, amount, status and payment of each person) as CSV. */
export const GET = withPermission("payroll.view", async (req, user) => {
  const m = readMonth(req);
  if (!m) return validationError("Indique año y mes (1-12)");
  const { csv } = await csvReport(m.year, m.month, EVENT_TYPE_NAME);
  await audit("payroll.report", { userId: user.id, details: m });
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nomina-${m.year}-${String(m.month).padStart(2, "0")}.csv"` },
  });
});
