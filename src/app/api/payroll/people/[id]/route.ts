import { NextResponse } from "next/server";
import { withPermission, readBody, errorResponse, forbidden, validationError, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { hasPermission } from "@/lib/core/permissions";
import { itemActionSchema, readMonth } from "@/lib/modules/payroll/schemas";
import { itemAction, itemDetail } from "@/lib/modules/payroll/service";

/** A person's line in a month (`?year=2026&month=10`); the id is the person's. Read only. */
export const GET = withPermission("payroll.view", async (req, _user, { params }: IdParams) => {
  const { id } = await params;
  const m = readMonth(req);
  if (!m) return validationError("Indique año y mes (1-12)");
  try {
    return NextResponse.json(await itemDetail(m.year, m.month, id));
  } catch (e) {
    return errorResponse(e);
  }
});

/** Review of a person (academic coordination) or recording of their payment (administrative coordination). */
export const POST = withPermission(["payroll.manage", "payroll.pay"], async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const m = readMonth(req);
  if (!m) return validationError("Indique año y mes (1-12)");
  const { data, error } = await readBody(req, itemActionSchema);
  if (error) return error;
  if (!hasPermission(user.role, data.action === "pay" ? "payroll.pay" : "payroll.manage")) return forbidden();
  try {
    const item = await itemAction(m.year, m.month, id, data, user.id);
    const { action, ...rest } = data;
    await audit(`payroll.item.${action}`, { userId: user.id, entity: "PayrollItem", entityId: item.id, details: { ...rest, personId: id, year: m.year, month: m.month } });
    return NextResponse.json(await itemDetail(m.year, m.month, id));
  } catch (e) {
    return errorResponse(e);
  }
});
