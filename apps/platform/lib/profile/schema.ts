import { z } from "zod";

/** Values match the CHECK constraint on profiles.experiencia_previa. */
export const EXPERIENCE_OPTIONS = [
  { value: "ninguna", label: "Todavía no trabajo en QA" },
  { value: "manual_menos_1", label: "QA manual, menos de 1 año" },
  { value: "manual_1_3", label: "QA manual, de 1 a 3 años" },
  { value: "manual_mas_3", label: "QA manual, más de 3 años" },
  { value: "algo_automatizacion", label: "Ya automaticé algo" },
] as const;

export type Experience = (typeof EXPERIENCE_OPTIONS)[number]["value"];

const experienceValues = EXPERIENCE_OPTIONS.map((o) => o.value) as [Experience, ...Experience[]];

export const LEVEL_LABELS = ["Fundamentos", "Junior", "Semi Senior", "Senior", "Lead"] as const;

export function levelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? LEVEL_LABELS[0];
}

export function experienceLabel(value: string | null): string {
  return EXPERIENCE_OPTIONS.find((o) => o.value === value)?.label ?? "Sin indicar";
}

export const onboardingSchema = z.object({
  experiencia_previa: z.enum(experienceValues, { error: "Elige tu experiencia previa." }),
  objetivo: z
    .string()
    .trim()
    .min(1, { error: "Cuéntanos tu objetivo en una frase." })
    .max(500, { error: "El objetivo puede tener hasta 500 caracteres." }),
});

export const profileSchema = onboardingSchema.extend({
  nombre: z
    .string()
    .trim()
    .min(1, { error: "Escribe tu nombre." })
    .max(100, { error: "El nombre puede tener hasta 100 caracteres." }),
});
