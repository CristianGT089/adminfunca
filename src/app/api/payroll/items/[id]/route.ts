import { NextResponse } from "next/server";
import { withPermission, readBody, errorResponse, forbidden, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { hasPermission } from "@/lib/core/permissions";
import { itemActionSchema } from "@/lib/modules/payroll/schemas";
import { itemAction, itemDetail } from "@/lib/modules/payroll/service";

export const GET = withPermission("payroll.view", async (_req, _user, { params }: IdParams) => {
  const { id } = await params;
  try {
    return NextResponse.json(await itemDetail(id));
  } catch (e) {
    return errorResponse(e);
  }
});

/** Review of a person (academic coordination) or recording of their payment (administrative coordination). */
export const POST = withPermission(["payroll.manage", "payroll.pay"], async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, itemActionSchema);
  if (error) return error;
  if (!hasPermission(user.role, data.action === "pay" ? "payroll.pay" : "payroll.manage")) return forbidden();
  try {
    await itemAction(id, data, user.id);
    const { action, ...rest } = data;
    await audit(`payroll.item.${action}`, { userId: user.id, entity: "PayrollItem", entityId: id, details: rest });
    return NextResponse.json(await itemDetail(id));
  } catch (e) {
    return errorResponse(e);
  }
});
