/**
 * Link between a user account and a person (by document number). If the person does not
 * exist it is created as staff with the account's name. Lives in core because it only touches
 * the users and people tables.
 */
import { prisma } from "./prisma";
import { encrypt, searchHash, normalizeCode } from "./crypto";
import { BusinessError } from "./http";

/** "Ana María Pérez Gómez" → firstNames "Ana María", lastNames "Pérez Gómez". */
export function splitName(name: string) {
  const p = name.trim().split(/\s+/);
  const n = p.length >= 4 ? 2 : 1;
  return { firstNames: p.slice(0, n).join(" "), lastNames: p.slice(n).join(" ") };
}

export async function linkPerson(userId: string, data: { name: string; documentType: string; document: string }) {
  const document = normalizeCode(data.document);
  if (document.length < 4) throw new BusinessError("Documento inválido");
  const documentHash = searchHash(document);
  let person = await prisma.person.findUnique({ where: { documentHash }, include: { user: { select: { id: true, name: true } } } });
  if (person?.user && person.user.id !== userId) throw new BusinessError(`Esa persona ya está vinculada a la cuenta de ${person.user.name}`, 409);
  if (!person) {
    person = await prisma.person.create({
      data: {
        type: "STAFF",
        ...splitName(data.name),
        documentType: data.documentType,
        documentHash,
        documentEncrypted: encrypt(document),
        documentLast4: document.slice(-4),
      },
      include: { user: { select: { id: true, name: true } } },
    });
  }
  await prisma.user.update({ where: { id: userId }, data: { personId: person.id } });
  return person;
}
