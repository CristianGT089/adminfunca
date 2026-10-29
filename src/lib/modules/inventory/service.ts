/**
 * Logic of the Inventory module. Endpoints only validate, call here and audit.
 * This is where it is decided what gets encrypted, what is returned to the client and the loan rules.
 */
import { Prisma, type Item, type LoanIssue, type Person, type Loan, type User, type ReturnCondition } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { encrypt, decrypt, mask, searchHash, normalizeCode } from "@/lib/core/crypto";
import { hasPermission } from "@/lib/core/permissions";
import { BusinessError } from "@/lib/core/http";
import type { ItemInput, PersonInput } from "./schemas";

/** Name kept for compatibility; it is a BusinessError. */
export class InventoryError extends BusinessError {}

/** Prisma client or the client of an interactive transaction (`prisma.$transaction(async (tx) => ...)`). */
export type Db = Prisma.TransactionClient;

/** True when the error is a violated unique constraint (Prisma `P2002`). */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Runs a write and turns a unique-constraint violation into a 409 business error. The pre-checks
 * give the friendly message in the usual case; this covers two requests racing past them.
 */
async function uniqueOr409<T>(write: () => Promise<T>, message: string): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (isUniqueViolation(e)) throw new InventoryError(message, 409);
    throw e;
  }
}

// ------------------------------------------------------------------ People

/** Client view of a person: the document is masked unless the user has permission. */
export type PublicPerson = {
  id: string;
  type: Person["type"];
  firstNames: string;
  lastNames: string;
  fullName: string;
  documentType: string;
  document: string; // "••••1234" or complete
  documentFull: boolean;
  cardCode: string | null;
  program: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  openLoans?: number;
};

export function toPublicPerson(p: Person & { _count?: { loans: number } }, user: Pick<User, "role">): PublicPerson {
  const viewDocument = hasPermission(user.role, "inventory.people.viewDocument");
  return {
    id: p.id,
    type: p.type,
    firstNames: p.firstNames,
    lastNames: p.lastNames,
    fullName: `${p.firstNames} ${p.lastNames}`.trim(),
    documentType: p.documentType,
    document: viewDocument ? (decrypt(p.documentEncrypted) ?? mask(p.documentLast4)) : mask(p.documentLast4),
    documentFull: viewDocument,
    cardCode: p.cardCode,
    program: p.program,
    email: p.email,
    phone: viewDocument ? decrypt(p.phoneEncrypted) : p.phoneEncrypted ? "••••••" : null,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    openLoans: p._count?.loans,
  };
}

function personFields(data: PersonInput) {
  const document = normalizeCode(data.document);
  return {
    type: data.type,
    firstNames: data.firstNames,
    lastNames: data.lastNames,
    documentType: data.documentType,
    documentHash: searchHash(document),
    documentEncrypted: encrypt(document),
    documentLast4: document.slice(-4),
    cardCode: data.cardCode ? normalizeCode(data.cardCode) : null,
    program: data.program,
    email: data.email,
    phoneEncrypted: data.phone ? encrypt(data.phone) : null,
  };
}

const PERSON_EXISTS = "Ya existe una persona con ese documento o código de carnet";
const PERSON_CONFLICT = "Otra persona ya tiene ese documento o código de carnet";

/** `db` lets a caller run it inside its own transaction (e.g. teacher + modules). */
export async function createPerson(data: PersonInput, db: Db = prisma) {
  const fields = personFields(data);
  const exists = await db.person.findFirst({
    where: { OR: [{ documentHash: fields.documentHash }, ...(fields.cardCode ? [{ cardCode: fields.cardCode }] : [])] },
  });
  if (exists) throw new InventoryError(PERSON_EXISTS, 409);
  return uniqueOr409(() => db.person.create({ data: fields }), PERSON_EXISTS);
}

export async function updatePerson(id: string, data: PersonInput, db: Db = prisma) {
  const fields = personFields(data);
  const conflict = await db.person.findFirst({
    where: {
      id: { not: id },
      OR: [{ documentHash: fields.documentHash }, ...(fields.cardCode ? [{ cardCode: fields.cardCode }] : [])],
    },
  });
  if (conflict) throw new InventoryError(PERSON_CONFLICT, 409);
  return uniqueOr409(() => db.person.update({ where: { id }, data: fields }), PERSON_CONFLICT);
}

/**
 * Finds the person by what the reader read: first by ID card code, then by document
 * number. Returns null if there is no match.
 */
export async function findPersonByCode(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return prisma.person.findFirst({
    where: { active: true, OR: [{ cardCode: normalized }, { documentHash: searchHash(normalized) }] },
    include: { _count: { select: { loans: { where: { returnedAt: null } } } } },
  });
}

/** Text search (first names, last names, program) or exact document/card code. */
export async function searchPeople(q: string, limit = 30) {
  const text = q.trim();
  const byCode = text ? await findPersonByCode(text) : null;
  if (byCode) return [byCode];
  return prisma.person.findMany({
    where: text
      ? {
          OR: [
            { firstNames: { contains: text, mode: "insensitive" } },
            { lastNames: { contains: text, mode: "insensitive" } },
            { program: { contains: text, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: [{ lastNames: "asc" }, { firstNames: "asc" }],
    take: limit,
    include: { _count: { select: { loans: { where: { returnedAt: null } } } } },
  });
}

// ------------------------------------------------------------------ Items

export function toPublicItem(i: Item & { loans?: (Loan & { person: Person })[] }) {
  const open = i.loans?.[0];
  return {
    id: i.id,
    code: i.code,
    name: i.name,
    category: i.category,
    description: i.description,
    brand: i.brand,
    serial: i.serial,
    location: i.location,
    campus: i.campus,
    status: i.status,
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
    openLoan: open
      ? {
          id: open.id,
          deliveredAt: open.deliveredAt.toISOString(),
          dueAt: open.dueAt?.toISOString() ?? null,
          person: { id: open.person.id, fullName: `${open.person.firstNames} ${open.person.lastNames}` },
        }
      : null,
  };
}
export type PublicItem = ReturnType<typeof toPublicItem>;

const includeOpenLoan = { loans: { where: { returnedAt: null }, include: { person: true }, take: 1 } } as const;

const ITEM_EXISTS = "Ya existe un elemento con ese código";
const ITEM_CONFLICT = "Otro elemento ya tiene ese código";

/** The LOANED status is controlled by loans and returns, never by the form. */
const formStatus = (status: ItemInput["status"]) => (status === "LOANED" ? "AVAILABLE" : status);

export async function createItem(data: ItemInput) {
  const code = normalizeCode(data.code);
  if (await prisma.item.findUnique({ where: { code } })) throw new InventoryError(ITEM_EXISTS, 409);
  return uniqueOr409(() => prisma.item.create({ data: { ...data, code, status: formStatus(data.status) }, include: includeOpenLoan }), ITEM_EXISTS);
}

export async function updateItem(id: string, data: ItemInput) {
  const code = normalizeCode(data.code);
  const conflict = await prisma.item.findFirst({ where: { code, id: { not: id } } });
  if (conflict) throw new InventoryError(ITEM_CONFLICT, 409);
  // Conditional updates instead of read-then-write: a loan or a return running at the same time
  // cannot be overwritten. A loaned item keeps LOANED (only its other fields change); any other
  // item takes the form status. If a loan/return flips the status between both attempts, retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const notLoaned = await uniqueOr409(
      () => prisma.item.updateMany({ where: { id, status: { not: "LOANED" } }, data: { ...data, code, status: formStatus(data.status) } }),
      ITEM_CONFLICT
    );
    if (notLoaned.count === 0) {
      // `status: undefined` leaves LOANED untouched.
      const loaned = await uniqueOr409(() => prisma.item.updateMany({ where: { id, status: "LOANED" }, data: { ...data, code, status: undefined } }), ITEM_CONFLICT);
      if (loaned.count === 0) {
        if (!(await prisma.item.findUnique({ where: { id }, select: { id: true } }))) throw new InventoryError("Elemento no encontrado", 404);
        continue;
      }
    }
    return prisma.item.findUniqueOrThrow({ where: { id }, include: includeOpenLoan });
  }
  throw new InventoryError("El elemento cambió mientras se guardaba. Intenta de nuevo.", 409);
}

export async function findItemByCode(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return prisma.item.findUnique({ where: { code: normalized }, include: includeOpenLoan });
}

export async function searchItems(q: string, status?: string, limit = 50) {
  const text = q.trim();
  const byCode = text ? await findItemByCode(text) : null;
  if (byCode) return [byCode];
  return prisma.item.findMany({
    where: {
      ...(status ? { status: status as Item["status"] } : {}),
      ...(text
        ? {
            OR: [
              { name: { contains: text, mode: "insensitive" } },
              { code: { contains: normalizeCode(text) } },
              { category: { contains: text, mode: "insensitive" } },
              { serial: { contains: text, mode: "insensitive" } },
              { location: { contains: text, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
    take: limit,
    include: includeOpenLoan,
  });
}

// ------------------------------------------------------------------ Loans

const includeLoan = {
  item: true,
  person: true,
  registeredBy: { select: { id: true, name: true } },
  returnedBy: { select: { id: true, name: true } },
  issues: { orderBy: { reportedAt: "asc" as const }, include: { registeredBy: { select: { id: true, name: true } } } },
} as const;

type IssueWithUser = LoanIssue & { registeredBy: { id: string; name: string } };

export function toPublicIssue(n: IssueWithUser) {
  return {
    id: n.id,
    type: n.type,
    description: n.description,
    reportedAt: n.reportedAt.toISOString(),
    minutesSinceDelivery: n.minutesSinceDelivery,
    registeredBy: n.registeredBy,
  };
}
export type PublicIssue = ReturnType<typeof toPublicIssue>;

export function toPublicLoan(
  p: Loan & {
    item: Item;
    person: Person;
    registeredBy: { id: string; name: string };
    returnedBy: { id: string; name: string } | null;
    issues?: IssueWithUser[];
  },
  user: Pick<User, "role">
) {
  return {
    issues: (p.issues ?? []).map(toPublicIssue),
    id: p.id,
    deliveredAt: p.deliveredAt.toISOString(),
    dueAt: p.dueAt?.toISOString() ?? null,
    returnedAt: p.returnedAt?.toISOString() ?? null,
    notes: p.notes,
    returnCondition: p.returnCondition,
    returnNote: p.returnNote,
    overdue: !p.returnedAt && !!p.dueAt && p.dueAt < new Date(),
    item: { id: p.item.id, code: p.item.code, name: p.item.name, category: p.item.category },
    person: toPublicPerson(p.person, user),
    registeredBy: p.registeredBy,
    returnedBy: p.returnedBy,
  };
}
export type PublicLoan = ReturnType<typeof toPublicLoan>;

export async function loanItem(args: { personId: string; itemId: string; registeredById: string; notes: string | null; deliveredAt: Date | null; dueAt: Date | null }) {
  return prisma.$transaction(async (tx) => {
    const person = await tx.person.findUnique({ where: { id: args.personId } });
    if (!person || !person.active) throw new InventoryError("La persona no existe o está inactiva", 404);
    const alreadyLoaned = async () => {
      const open = await tx.loan.findFirst({ where: { itemId: args.itemId, returnedAt: null }, include: { person: true } });
      const who = open ? `${open.person.firstNames} ${open.person.lastNames}` : "otra persona";
      return new InventoryError(`El elemento ya está prestado a ${who}. Regístralo como devuelto primero.`, 409);
    };
    // Claim the item atomically: only one of two simultaneous loans gets count 1 (the row lock makes
    // the other one re-check the status after the first commits). Throwing later rolls the claim back.
    const claimed = await tx.item.updateMany({ where: { id: args.itemId, status: "AVAILABLE" }, data: { status: "LOANED" } });
    if (claimed.count === 0) {
      const item = await tx.item.findUnique({ where: { id: args.itemId } });
      if (!item) throw new InventoryError("El elemento no existe", 404);
      if (item.status === "RETIRED") throw new InventoryError("El elemento está dado de baja");
      if (item.status === "MAINTENANCE") throw new InventoryError("El elemento está en mantenimiento");
      throw await alreadyLoaned();
    }
    // One open loan per item, even if the status was out of sync.
    if (await tx.loan.findFirst({ where: { itemId: args.itemId, returnedAt: null }, select: { id: true } })) throw await alreadyLoaned();
    const loan = await tx.loan.create({
      data: {
        personId: person.id,
        itemId: args.itemId,
        registeredById: args.registeredById,
        notes: args.notes,
        deliveredAt: args.deliveredAt ?? undefined,
        dueAt: args.dueAt,
      },
      include: includeLoan,
    });
    return loan;
  });
}

export async function returnItem(args: { loanId: string; returnedById: string; returnCondition: ReturnCondition; returnNote: string | null }) {
  return prisma.$transaction(async (tx) => {
    // Conditional close: of two simultaneous returns only one finds the loan still open.
    const closed = await tx.loan.updateMany({
      where: { id: args.loanId, returnedAt: null },
      data: { returnedAt: new Date(), returnedById: args.returnedById, returnCondition: args.returnCondition, returnNote: args.returnNote },
    });
    if (closed.count === 0) {
      const exists = await tx.loan.findUnique({ where: { id: args.loanId }, select: { id: true } });
      if (!exists) throw new InventoryError("Préstamo no encontrado", 404);
      throw new InventoryError("Ese préstamo ya fue devuelto", 409);
    }
    const updated = await tx.loan.findUniqueOrThrow({ where: { id: args.loanId }, include: includeLoan });
    await tx.item.update({
      where: { id: updated.itemId },
      data: { status: args.returnCondition === "DAMAGED" ? "MAINTENANCE" : "AVAILABLE" },
    });
    return updated;
  });
}

/** Registers an issue on a loan and fixes the distance in minutes since delivery. */
export async function registerIssue(args: { loanId: string; type: LoanIssue["type"]; description: string; registeredById: string }) {
  const loan = await prisma.loan.findUnique({ where: { id: args.loanId } });
  if (!loan) throw new InventoryError("Préstamo no encontrado", 404);
  const now = new Date();
  const minutes = Math.max(0, Math.round((now.getTime() - loan.deliveredAt.getTime()) / 60000));
  return prisma.loanIssue.create({
    data: { loanId: loan.id, type: args.type, description: args.description, reportedAt: now, minutesSinceDelivery: minutes, registeredById: args.registeredById },
    include: { registeredBy: { select: { id: true, name: true } } },
  });
}

export async function listLoans(options: { open?: boolean; personId?: string; itemId?: string; limit?: number } = {}) {
  return prisma.loan.findMany({
    where: {
      ...(options.open === true ? { returnedAt: null } : options.open === false ? { returnedAt: { not: null } } : {}),
      ...(options.personId ? { personId: options.personId } : {}),
      ...(options.itemId ? { itemId: options.itemId } : {}),
    },
    orderBy: { deliveredAt: "desc" },
    take: options.limit ?? 100,
    include: includeLoan,
  });
}

export async function inventorySummary() {
  const [available, loaned, maintenance, retired, people, open, overdue, today] = await Promise.all([
    prisma.item.count({ where: { status: "AVAILABLE" } }),
    prisma.item.count({ where: { status: "LOANED" } }),
    prisma.item.count({ where: { status: "MAINTENANCE" } }),
    prisma.item.count({ where: { status: "RETIRED" } }),
    prisma.person.count({ where: { active: true } }),
    prisma.loan.count({ where: { returnedAt: null } }),
    prisma.loan.count({ where: { returnedAt: null, dueAt: { lt: new Date() } } }),
    prisma.loan.count({ where: { deliveredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);
  return { items: { available, loaned, maintenance, retired, total: available + loaned + maintenance + retired }, people, loans: { open, overdue, today } };
}
