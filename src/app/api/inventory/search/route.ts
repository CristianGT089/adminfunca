import { NextResponse } from "next/server";
import { withPermission, readBody } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { searchSchema } from "@/lib/modules/inventory/schemas";
import { findItemByCode, findPersonByCode, toPublicItem, toPublicPerson } from "@/lib/modules/inventory/service";

/**
 * A single endpoint for the barcode reader: receives what was read and answers whether it is a
 * person (ID card / document) or an item (label). This way the inventory desk does not need to
 * know what was scanned first. Only the desk (inventory.loan) uses it, and finding a person by
 * document is audited like any other lookup of personal data.
 */
export const POST = withPermission("inventory.loan", async (req, user) => {
  const { data, error } = await readBody(req, searchSchema);
  if (error) return error;
  const [person, item] = await Promise.all([findPersonByCode(data.code), findItemByCode(data.code)]);
  if (person) {
    await audit("people.scan", { userId: user.id, entity: "Person", entityId: person.id });
    return NextResponse.json({ type: "person", person: toPublicPerson(person, user) });
  }
  if (item) return NextResponse.json({ type: "item", item: toPublicItem(item) });
  return NextResponse.json({ type: null }, { status: 404 });
});
