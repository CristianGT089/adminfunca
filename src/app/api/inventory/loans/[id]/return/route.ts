import { NextResponse } from "next/server";
import { withPermission, readBody, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { returnSchema } from "@/lib/modules/inventory/schemas";
import { returnItem, InventoryError, toPublicLoan } from "@/lib/modules/inventory/service";

export const POST = withPermission("inventory.loan", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, returnSchema);
  if (error) return error;
  try {
    const loan = await returnItem({ loanId: id, returnedById: user.id, returnCondition: data.returnCondition, returnNote: data.returnNote ?? null });
    await audit("inventory.return", { userId: user.id, entity: "Loan", entityId: id, details: { returnCondition: data.returnCondition } });
    return NextResponse.json({ loan: toPublicLoan(loan, user) });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
