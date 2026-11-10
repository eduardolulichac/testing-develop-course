import { z } from "zod";

export const feedbackSchema = z.object({
  lessonId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comentario: z
    .string()
    .trim()
    .max(500)
    .transform((s) => (s === "" ? null : s)),
});
