import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exercisesFileSchema, type Exercise } from "@course/shared";
import { parse } from "yaml";

/**
 * Reads the exercises next to a lesson file (`<modulo>.ejercicios.yaml`). Server only: hints and
 * solutions are released one at a time. `lessonFile` must come from `findLessonFile`.
 */
export async function loadExercises(lessonFile: string, modulo: string): Promise<Exercise[]> {
  let text: string;
  try {
    text = await readFile(path.join(path.dirname(lessonFile), `${modulo}.ejercicios.yaml`), "utf8");
  } catch {
    return [];
  }
  return exercisesFileSchema.parse(parse(text)).ejercicios;
}
