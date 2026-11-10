import { z } from "zod";

export const usuario = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["customer", "admin"]),
});

export const sesion = z.object({
  token: z.string().min(10),
  expiresInHours: z.number(),
  user: usuario,
});

export const errorDeApi = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
