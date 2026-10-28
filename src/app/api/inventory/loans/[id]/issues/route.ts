import { NextResponse } from "next/server";
import { withPermission, readBody, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { issueSchema } from "@/lib/modules/inventory/schemas";
import { InventoryError, toPublicIssue, registerIssue } from "@/lib/modules/inventory/service";

export const POST = withPermission("inventory.loan", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, issueSchema);
  if (error) return error;
  try {
    const issue = await registerIssue({ loanId: id, type: data.type, description: data.description, registeredById: user.id });
    await audit("inventory.issue", { userId: user.id, entity: "Loan", entityId: id, details: { type: issue.type, minutesSinceDelivery: issue.minutesSinceDelivery } });
    return NextResponse.json({ issue: toPublicIssue(issue) }, { status: 201 });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
