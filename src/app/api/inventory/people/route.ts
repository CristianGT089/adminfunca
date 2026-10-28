import { NextResponse } from "next/server";
import { withPermission, readBody } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { personSchema } from "@/lib/modules/inventory/schemas";
import { searchPeople, createPerson, InventoryError, toPublicPerson } from "@/lib/modules/inventory/service";

export const GET = withPermission("inventory.people.view", async (req, user) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const people = await searchPeople(q);
  // Looking up personal data is recorded in the audit log (without the searched text, which may be a document).
  if (q) await audit("people.search", { userId: user.id, details: { results: people.length } });
  return NextResponse.json({ people: people.map((p) => toPublicPerson(p, user)) });
});

export const POST = withPermission("inventory.people.manage", async (req, user) => {
  const { data, error } = await readBody(req, personSchema);
  if (error) return error;
  try {
    const person = await createPerson(data);
    await audit("people.create", { userId: user.id, entity: "Person", entityId: person.id, details: { type: person.type } });
    return NextResponse.json({ person: toPublicPerson(person, user) }, { status: 201 });
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
