import { z } from "zod";
import { challengeCriteriaSchema } from "./challenge-result";

/** Phases of the course (Annex A of PLAN_DESARROLLO.md). */
export const PHASES = [0, 1, 2, 3, 4, 5] as const;

/** Level label per phase, as in the Annex A table. */
export const LEVEL_BY_PHASE = {
  0: "Base",
  1: "Junior",
  2: "Semi Senior",
  3: "Semi Senior sólido",
  4: "Senior en formación",
  5: "Senior / Lead",
} as const;

export const LEVELS = Object.values(LEVEL_BY_PHASE) as [
  (typeof LEVEL_BY_PHASE)[0],
  ...(typeof LEVEL_BY_PHASE)[keyof typeof LEVEL_BY_PHASE][],
];

/** Number of modules per phase (5+8+9+8+7+6 = 43). */
export const MODULES_PER_PHASE = { 0: 5, 1: 8, 2: 9, 3: 8, 4: 7, 5: 6 } as const;
export const TOTAL_MODULES = 43;

/** The 9 lesson sections, in required order (section 8 of the plan). */
export const LESSON_SECTIONS = [
  "Objetivo y contexto",
  "Explicación paso a paso",
  "Ejemplo resuelto",
  "Ejercicios guiados",
  "Reto sin guía",
  "Uso de IA en este módulo",
  "Errores comunes",
  "Resumen",
  "Autoevaluación",
] as const;

export const PUBLICATION_STATES = ["borrador", "publicado"] as const;

export const MODULE_CODE_REGEX = /^[0-5]\.[1-9]\d*$/;
const SLUG_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const moduleCodeSchema = z
  .string()
  .regex(MODULE_CODE_REGEX, 'El módulo debe tener formato "N.N" con fase 0 a 5 (ej. "1.2")');

export const lessonFrontmatterSchema = z
  .strictObject({
    modulo: moduleCodeSchema,
    titulo: z.string().trim().min(3, "El título es obligatorio"),
    fase: z.number().int().min(0).max(5),
    nivel: z.enum(LEVELS),
    duracion_min: z.number().int().min(5).max(480),
    prerequisitos: z.array(moduleCodeSchema),
    escenario: z.string().regex(SLUG_ID_REGEX, "Id de escenario inválido").optional(),
    reto: z.string().regex(SLUG_ID_REGEX, "Id de reto inválido").optional(),
    version: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'La versión debe ser "AAAA-MM"'),
    herramientas: z.array(z.string().trim().min(1)),
    /** Only "publicado" lessons are shown to students (plan E4). */
    estado: z.enum(PUBLICATION_STATES).default("borrador"),
  })
  .superRefine((fm, ctx) => {
    if (MODULE_CODE_REGEX.test(fm.modulo) && Number(fm.modulo.split(".")[0]) !== fm.fase) {
      ctx.addIssue({
        code: "custom",
        path: ["fase"],
        message: `La fase (${fm.fase}) no coincide con el módulo ${fm.modulo}`,
      });
    }
    if (fm.nivel !== LEVEL_BY_PHASE[fm.fase as keyof typeof LEVEL_BY_PHASE]) {
      ctx.addIssue({
        code: "custom",
        path: ["nivel"],
        message: `El nivel de la fase ${fm.fase} debe ser "${LEVEL_BY_PHASE[fm.fase as keyof typeof LEVEL_BY_PHASE]}"`,
      });
    }
    if (fm.prerequisitos.includes(fm.modulo)) {
      ctx.addIssue({
        code: "custom",
        path: ["prerequisitos"],
        message: "Un módulo no puede ser prerrequisito de sí mismo",
      });
    }
    if (new Set(fm.prerequisitos).size !== fm.prerequisitos.length) {
      ctx.addIssue({
        code: "custom",
        path: ["prerequisitos"],
        message: "Prerrequisitos duplicados",
      });
    }
  });

export type LessonFrontmatter = z.infer<typeof lessonFrontmatterSchema>;

export type FrontmatterResult =
  { success: true; data: LessonFrontmatter } | { success: false; errors: string[] };

/** Validates an already-parsed frontmatter object. Returns readable errors. */
export function validateLessonFrontmatter(input: unknown): FrontmatterResult {
  const result = lessonFrontmatterSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Compares module codes numerically ("1.10" after "1.2"). */
export function compareModuleCodes(a: string, b: string): number {
  const [pa = 0, ma = 0] = a.split(".").map(Number);
  const [pb = 0, mb = 0] = b.split(".").map(Number);
  return pa - pb || ma - mb;
}

const nonEmpty = z.string().trim().min(1);

/** Guided exercise, diagnostic or challenge declared next to a lesson (table `exercises`). */
export const exerciseSchema = z
  .strictObject({
    slug: z.string().regex(SLUG_ID_REGEX, "Slug de ejercicio inválido"),
    tipo: z.enum(["guiado", "reto", "diagnostico"]),
    titulo: nonEmpty,
    escenario: z.string().regex(SLUG_ID_REGEX, "Id de escenario inválido").optional(),
    criterio_aprobacion: z.record(z.string(), z.unknown()).default({}),
    /** Escalated hints 1..3, shown one at a time before the solution (E2-C2). */
    pistas: z.array(nonEmpty).max(3).default([]),
    solucion: nonEmpty.optional(),
  })
  .superRefine((ex, ctx) => {
    if (ex.tipo === "guiado" && (ex.pistas.length !== 3 || !ex.solucion)) {
      ctx.addIssue({
        code: "custom",
        path: ["pistas"],
        message: "Un ejercicio guiado necesita 3 pistas y una solución",
      });
    }
    if (ex.tipo === "reto") {
      const criteria = challengeCriteriaSchema.safeParse(ex.criterio_aprobacion);
      if (!criteria.success) {
        for (const issue of criteria.error.issues) {
          ctx.addIssue({
            code: "custom",
            path: ["criterio_aprobacion", ...issue.path],
            message: issue.message,
          });
        }
      } else if (ex.escenario !== criteria.data.arena.escenario) {
        // The exercise scenario and the Arena scenario the evaluator runs must be the same.
        ctx.addIssue({
          code: "custom",
          path: ["escenario"],
          message: `El escenario del reto debe ser "${criteria.data.arena.escenario}" (criterio_aprobacion.arena)`,
        });
      }
    }
  });

export type Exercise = z.infer<typeof exerciseSchema>;

/** `<modulo>.ejercicios.yaml`: the exercises of one lesson. */
export const exercisesFileSchema = z.strictObject({ ejercicios: z.array(exerciseSchema) });

export const quizQuestionSchema = z
  .strictObject({
    id: z.string().regex(SLUG_ID_REGEX, "Id de pregunta inválido"),
    enunciado: nonEmpty,
    opciones: z.array(nonEmpty).min(2).max(6),
    /** Index into `opciones`. Server-side only: never sent to the client. */
    correcta: z.number().int().min(0),
    explicacion: nonEmpty,
  })
  .refine((q) => q.correcta < q.opciones.length, {
    path: ["correcta"],
    message: "La respuesta correcta debe ser un índice válido de `opciones`",
  });

/** Quiz bank of a lesson (`<modulo>.quiz.yaml`): at least 5 questions (plan section 8). */
export const quizSchema = z
  .strictObject({
    preguntas: z.array(quizQuestionSchema).min(5, "El cuestionario necesita 5 o más preguntas"),
  })
  .superRefine((quiz, ctx) => {
    const ids = quiz.preguntas.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["preguntas"], message: "Ids de pregunta duplicados" });
    }
  });

export type Quiz = z.infer<typeof quizSchema>;

/**
 * Line numbers (1-based, within `body`) of unfinished-section markers: a line that is just
 * `TODO`, which is what `generate-lesson-skeletons` writes. A published lesson must have none.
 */
export function findTodoMarkers(body: string): number[] {
  return body.split(/\r?\n/).flatMap((line, i) => (/^\s*TODO\s*$/.test(line) ? [i + 1] : []));
}
