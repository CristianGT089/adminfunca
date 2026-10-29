import { z } from "zod";
import "@/lib/core/zodConfig";
import { parseLinks } from "./youtube";

export const projectionSchema = z.object({
  links: z
    .string()
    .trim()
    .max(4000, "Demasiados links")
    .refine((t) => parseLinks(t) !== null, "No encontré ningún link de YouTube válido"),
  shuffle: z.boolean().default(false),
});

export type ProjectionInput = z.infer<typeof projectionSchema>;
