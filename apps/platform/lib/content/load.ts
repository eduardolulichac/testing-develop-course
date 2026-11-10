import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluate } from "@mdx-js/mdx";
import type { MDXContent } from "mdx/types";
import remarkGfm from "remark-gfm";
import * as runtime from "react/jsx-runtime";
import { parseLesson, type ParsedLesson } from "./lesson";
import { safeMdx } from "./safe-mdx";

/** Fixtures used for development and tests; they live outside the repo-root `content/`. */
export const FIXTURES_DIR = path.join(process.cwd(), "src", "content-fixtures");

/** Repo-root `content/` (the app runs with cwd = apps/platform). Override with COURSE_CONTENT_DIR. */
export const CONTENT_DIR =
  process.env.COURSE_CONTENT_DIR ?? path.resolve(process.cwd(), "../../content");

/** JSX elements a lesson may use; mirrors `lessonComponents` (checked by a test). */
export const LESSON_COMPONENT_NAMES = [
  "Objetivo",
  "Paso",
  "Ejemplo",
  "Ejercicio",
  "Reto",
  "Resumen",
  "ErrorComun",
  "Quiz",
  "AbrirArena",
] as const;

export type LoadedLesson = ParsedLesson & { Content: MDXContent };

/**
 * Reads an MDX lesson from disk, validates its frontmatter and compiles the body to a React
 * component (server side only; lesson files are trusted, repo-authored code).
 */
export async function loadLesson(filePath: string): Promise<LoadedLesson> {
  const source = await readFile(filePath, "utf8");
  const parsed = parseLesson(source, path.basename(filePath));
  const { default: Content } = await evaluate(parsed.body, {
    ...runtime,
    remarkPlugins: [remarkGfm, safeMdx(LESSON_COMPONENT_NAMES)],
  });
  return { ...parsed, Content };
}
