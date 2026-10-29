/**
 * Link between a user account and a person (by document number). If the person does not
 * exist it is created as staff with the account's name. Lives in core because it only touches
 * the users and people tables.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { encrypt, searchHash, normalizeCode } from "./crypto";
import { BusinessError } from "./http";

/** "Ana María Pérez Gómez" → firstNames "Ana María", lastNames "Pérez Gómez". */
export function splitName(name: string) {
  const p = name.trim().split(/\s+/);
  const n = p.length >= 4 ? 2 : 1;
  return { firstNames: p.slice(0, n).join(" "), lastNames: p.slice(n).join(" ") };
}

/**
 * `db` is optional: pass the client of an interactive transaction so the link commits (or rolls
 * back) together with the caller's other writes, e.g. creating the account.
 */
export async function linkPerson(userId: string, data: { name: string; documentType: string; document: string }, db: Prisma.TransactionClient = prisma) {
  try {
    return await link(db, userId, data);
  } catch (e) {
    // Two requests racing past the checks below: the same person created twice, or linked to two accounts.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new BusinessError("Esa persona ya está vinculada a otra cuenta o se acaba de registrar. Intente de nuevo.", 409);
    }
    throw e;
  }
}

async function link(db: Prisma.TransactionClient, userId: string, data: { name: string; documentType: string; document: string }) {
  const document = normalizeCode(data.document);
  if (document.length < 4) throw new BusinessError("Documento inválido");
  const documentHash = searchHash(document);
  let person = await db.person.findUnique({ where: { documentHash }, include: { user: { select: { id: true, name: true } } } });
  if (person?.user && person.user.id !== userId) throw new BusinessError(`Esa persona ya está vinculada a la cuenta de ${person.user.name}`, 409);
  if (!person) {
    person = await db.person.create({
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
  await db.user.update({ where: { id: userId }, data: { personId: person.id } });
  return person;
}
