import { validateLessonFrontmatter, type LessonFrontmatter } from "@course/shared";
import { parse } from "yaml";

export type ParsedLesson = { frontmatter: LessonFrontmatter; body: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Splits a lesson file into frontmatter (YAML, validated with the shared Zod schema) and the
 * MDX body. Throws an Error listing every problem so a bad lesson fails loudly at build time.
 */
export function parseLesson(source: string, label = "lección"): ParsedLesson {
  const match = FRONTMATTER.exec(source);
  if (!match) throw new Error(`${label}: falta el frontmatter (bloque --- ... ---)`);
  let raw: unknown;
  try {
    raw = parse(match[1] ?? "");
  } catch (error) {
    throw new Error(`${label}: YAML inválido: ${(error as Error).message}`, {
      cause: error,
    });
  }
  const result = validateLessonFrontmatter(raw);
  if (!result.success) {
    throw new Error(`${label}: frontmatter inválido\n- ${result.errors.join("\n- ")}`);
  }
  return { frontmatter: result.data, body: match[2] ?? "" };
}
