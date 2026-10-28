import { NextResponse } from "next/server";
import { withPermission, readBody, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { payAllSchema } from "@/lib/modules/payroll/schemas";
import { payAll } from "@/lib/modules/payroll/service";

/** Records the payment of every verified person of an approved month. */
export const POST = withPermission("payroll.pay", async (req, user) => {
  const { data, error } = await readBody(req, payAllSchema);
  if (error) return error;
  try {
    const n = await payAll(data.year, data.month, data.date, data.reference ?? null);
    await audit("payroll.payAll", { userId: user.id, entity: "PayrollPeriod", details: { ...data, paid: n } });
    return NextResponse.json({ paid: n });
  } catch (e) {
    return errorResponse(e);
  }
});
