import { NextResponse } from "next/server";
import { withPermission, readBody, queryLimit } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { ITEM_STATUSES, itemSchema } from "@/lib/modules/inventory/schemas";
import { searchItems, createItem, toPublicItem, InventoryError } from "@/lib/modules/inventory/service";

export const GET = withPermission("inventory.view", async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const validStatus = ITEM_STATUSES.find((s) => s === status);
  const items = await searchItems(url.searchParams.get("q") ?? "", validStatus, queryLimit(url, 200, 500));
  return NextResponse.json({ items: items.map(toPublicItem) });
});

export const POST = withPermission("inventory.items.manage", async (req, user) => {
  const { data, error } = await readBody(req, itemSchema);
  if (error) return error;
  try {
    const item = await createItem(data);
    await audit("items.create", { userId: user.id, entity: "Item", entityId: item.id, details: { code: item.code } });
    return NextResponse.json({ item: toPublicItem(item) }, { status: 201 });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
