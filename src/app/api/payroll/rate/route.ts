import { NextResponse } from "next/server";
import { withPermission, readBody, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { rateSchema } from "@/lib/modules/payroll/schemas";
import { setRate } from "@/lib/modules/payroll/service";

/** A person's base hourly rate. */
export const PATCH = withPermission("payroll.manage", async (req, user) => {
  const { data, error } = await readBody(req, rateSchema);
  if (error) return error;
  try {
    const p = await setRate(data.personId, data.hourlyRate);
    await audit("payroll.rate", { userId: user.id, entity: "Person", entityId: p.id, details: { hourlyRate: data.hourlyRate } });
    return NextResponse.json({ hourlyRate: p.hourlyRate });
  } catch (e) {
    return errorResponse(e);
  }
});
