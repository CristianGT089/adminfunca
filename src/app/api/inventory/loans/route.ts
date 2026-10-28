import { NextResponse } from "next/server";
import { withPermission, readBody, queryLimit } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { loanSchema } from "@/lib/modules/inventory/schemas";
import { loanItem, InventoryError, listLoans, toPublicLoan } from "@/lib/modules/inventory/service";

export const GET = withPermission("inventory.view", async (req, user) => {
  const url = new URL(req.url);
  const params = url.searchParams;
  const status = params.get("status"); // "open" | "closed" | null (all)
  const loans = await listLoans({
    open: status === "open" ? true : status === "closed" ? false : undefined,
    personId: params.get("personId") ?? undefined,
    itemId: params.get("itemId") ?? undefined,
    limit: queryLimit(url, 200, 500),
  });
  return NextResponse.json({ loans: loans.map((p) => toPublicLoan(p, user)) });
});

export const POST = withPermission("inventory.loan", async (req, user) => {
  const { data, error } = await readBody(req, loanSchema);
  if (error) return error;
  // A delivery can be registered late, but not in the future (it would skew the issue timings).
  if (data.deliveredAt && new Date(data.deliveredAt).getTime() > Date.now() + 5 * 60000) {
    return NextResponse.json({ error: "La fecha de entrega no puede ser futura" }, { status: 400 });
  }
  try {
    const loan = await loanItem({
      personId: data.personId,
      itemId: data.itemId,
      registeredById: user.id,
      notes: data.notes ?? null,
      deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
    });
    await audit("inventory.loan", {
      userId: user.id, entity: "Loan", entityId: loan.id,
      details: { itemId: loan.itemId, personId: loan.personId },
    });
    return NextResponse.json({ loan: toPublicLoan(loan, user) }, { status: 201 });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
