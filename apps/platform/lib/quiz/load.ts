import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { quizSchema, type Quiz } from "@course/shared";
import { parse } from "yaml";

/**
 * Reads the quiz bank next to a lesson file (`<modulo>.quiz.yaml`). Server only: the bank holds
 * the correct answers. `lessonFile` must come from `findLessonFile`, never from the request.
 * Returns null when the lesson has no bank; throws on an invalid one.
 */
export async function loadQuiz(lessonFile: string, modulo: string): Promise<Quiz | null> {
  let text: string;
  try {
    text = await readFile(path.join(path.dirname(lessonFile), `${modulo}.quiz.yaml`), "utf8");
  } catch {
    return null;
  }
  return quizSchema.parse(parse(text));
}
