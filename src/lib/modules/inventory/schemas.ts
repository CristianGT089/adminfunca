import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const PERSON_TYPES = ["STUDENT", "TEACHER", "STAFF", "EXTERNAL"] as const;
export const DOCUMENT_TYPES = ["CC", "TI", "CE", "PA", "PEP", "PPT", "NIT"] as const;
export const ITEM_STATUSES = ["AVAILABLE", "LOANED", "MAINTENANCE", "RETIRED"] as const;
export const RETURN_CONDITIONS = ["GOOD", "DAMAGED", "INCOMPLETE"] as const;
export const CAMPUSES = ["Bogotá", "Itagüí"] as const;

export const personSchema = z.object({
  type: z.enum(PERSON_TYPES).default("STUDENT"),
  firstNames: text(80).min(1, "Los nombres son obligatorios"),
  lastNames: text(80).min(1, "Los apellidos son obligatorios"),
  documentType: z.enum(DOCUMENT_TYPES).default("CC"),
  document: text(30)
    .min(4, "El documento debe tener al menos 4 caracteres")
    .regex(/^[A-Za-z0-9.\-\s]+$/, "El documento solo admite letras y números"),
  cardCode: optionalText(64),
  program: optionalText(120),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Correo inválido"),
  phone: optionalText(30),
});
export type PersonInput = z.infer<typeof personSchema>;

export const itemSchema = z.object({
  code: text(64).min(1, "El código es obligatorio"),
  name: text(120).min(1, "El nombre es obligatorio"),
  category: optionalText(80),
  description: optionalText(500),
  brand: optionalText(80),
  serial: optionalText(80),
  location: optionalText(120),
  campus: optionalText(40),
  status: z.enum(ITEM_STATUSES).default("AVAILABLE"),
  notes: optionalText(500),
});
export type ItemInput = z.infer<typeof itemSchema>;

export const loanSchema = z.object({
  personId: z.string().min(1),
  itemId: z.string().min(1),
  notes: optionalText(500),
  // Moment of delivery. Defaults to "now"; can be adjusted if it is recorded later.
  deliveredAt: z.iso.datetime().optional().nullable(),
  dueAt: z.iso.datetime().optional().nullable(),
});

export const ISSUE_TYPES = ["DEFECT", "MISSING_PART", "DAMAGED_IN_USE", "OTHER"] as const;

export const issueSchema = z.object({
  type: z.enum(ISSUE_TYPES).default("DEFECT"),
  description: text(500).min(3, "Describe la novedad"),
});

export const returnSchema = z.object({
  returnCondition: z.enum(RETURN_CONDITIONS).default("GOOD"),
  returnNote: optionalText(500),
});

/** What comes from the barcode reader or the search box. */
export const searchSchema = z.object({
  code: text(120).min(1),
});
