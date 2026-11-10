import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Escribe un correo válido." }));
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, {
    error: `La clave debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  })
  .max(72, { error: "La clave no puede tener más de 72 caracteres." });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Escribe tu clave." }),
});

export const signUpSchema = z.object({
  nombre: z.string().trim().min(1, { error: "Escribe tu nombre." }).max(100),
  email,
  password,
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    error: "Las claves no coinciden.",
    path: ["confirm"],
  });

/** Returns the first validation message, for a compact form error. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos del formulario.";
}
