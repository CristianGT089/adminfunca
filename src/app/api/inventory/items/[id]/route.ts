import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/prisma";
import { withPermission, readBody, notFound, type IdParams } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { itemSchema } from "@/lib/modules/inventory/schemas";
import { updateItem, toPublicItem, InventoryError, listLoans, toPublicLoan } from "@/lib/modules/inventory/service";

export const GET = withPermission("inventory.view", async (_req, user, { params }: IdParams) => {
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id }, include: { loans: { where: { returnedAt: null }, include: { person: true }, take: 1 } } });
  if (!item) return notFound("Elemento");
  const loans = await listLoans({ itemId: id, limit: 50 });
  return NextResponse.json({ item: toPublicItem(item), loans: loans.map((p) => toPublicLoan(p, user)) });
});

export const PATCH = withPermission("inventory.items.manage", async (req, user, { params }: IdParams) => {
  const { id } = await params;
  const { data, error } = await readBody(req, itemSchema);
  if (error) return error;
  try {
    const item = await updateItem(id, data);
    await audit("items.update", { userId: user.id, entity: "Item", entityId: id, details: { code: item.code, status: item.status } });
    return NextResponse.json({ item: toPublicItem(item) });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
