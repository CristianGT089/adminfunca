import { z } from "zod";
import { personSchema } from "@/lib/modules/inventory/schemas";

export const moduleSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  program: z.string().trim().min(2, "El programa es obligatorio").max(120),
  hours: z.coerce.number().int().min(0).max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
export type ModuleInput = z.infer<typeof moduleSchema>;

/** A teacher is a Person of type TEACHER plus the modules they teach. */
export const teacherSchema = personSchema.omit({ type: true }).extend({
  moduleIds: z.array(z.string().min(1)).default([]),
});
export type TeacherInput = z.infer<typeof teacherSchema>;
