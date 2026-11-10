import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  exercisesFileSchema,
  quizSchema,
  type Exercise,
  type LessonFrontmatter,
} from "@course/shared";
import { parse } from "yaml";
import { z } from "zod";
import { parseLesson } from "./lesson";

export type ModuleSync = {
  fase: number;
  codigo: string;
  titulo: string;
  orden: number;
  prerequisitos: string[];
  lesson: {
    slug: string;
    titulo: string;
    orden: number;
    version: string;
    duracion_min: number;
    estado: LessonFrontmatter["estado"];
  };
  exercises: Exercise[];
};

export type SyncPlan = { modules: ModuleSync[]; errors: string[] };

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

/** Reads and validates an optional YAML sidecar file; `undefined` when it does not exist. */
function readSidecar<T>(file: string, schema: z.ZodType<T>, errors: string[]): T | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const result = schema.safeParse(parse(text));
  if (result.success) return result.data;
  for (const i of result.error.issues) {
    errors.push(`${path.basename(file)}: ${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  return undefined;
}

/**
 * Builds the content sync plan from `content/**`: one module and one lesson per MDX file,
 * plus the exercises declared in `<modulo>.ejercicios.yaml`. Quiz banks (`<modulo>.quiz.yaml`)
 * are validated but never stored: the server reads them at request time so the correct
 * answers never travel to the client. Pure: touches only the file system.
 */
export function buildSyncPlan(contentDir: string): SyncPlan {
  const errors: string[] = [];
  const modules: ModuleSync[] = [];
  const seenSlugs = new Set<string>();
  const seenExercises = new Set<string>();

  for (const file of walk(contentDir)
    .filter((f) => f.endsWith(".mdx"))
    .sort()) {
    const label = path.relative(contentDir, file);
    let fm: LessonFrontmatter;
    try {
      fm = parseLesson(readFileSync(file, "utf8"), label).frontmatter;
    } catch (error) {
      errors.push((error as Error).message);
      continue;
    }

    const slug = path.basename(file, ".mdx").replaceAll(".", "-");
    if (seenSlugs.has(slug)) errors.push(`${label}: slug de lección duplicado (${slug})`);
    seenSlugs.add(slug);

    const dir = path.dirname(file);
    const exercises =
      readSidecar(path.join(dir, `${fm.modulo}.ejercicios.yaml`), exercisesFileSchema, errors)
        ?.ejercicios ?? [];
    readSidecar(path.join(dir, `${fm.modulo}.quiz.yaml`), quizSchema, errors);

    for (const ex of exercises) {
      if (seenExercises.has(ex.slug)) errors.push(`${label}: ejercicio duplicado (${ex.slug})`);
      seenExercises.add(ex.slug);
    }

    modules.push({
      fase: fm.fase,
      codigo: fm.modulo,
      titulo: fm.titulo,
      orden: Number(fm.modulo.split(".")[1]),
      prerequisitos: fm.prerequisitos,
      lesson: {
        slug,
        titulo: fm.titulo,
        orden: 1,
        version: fm.version,
        duracion_min: fm.duracion_min,
        estado: fm.estado,
      },
      exercises,
    });
  }
  return { modules, errors };
}
