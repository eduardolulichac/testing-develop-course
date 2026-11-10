import "server-only";
import { readdirSync } from "node:fs";
import path from "node:path";
import { CONTENT_DIR } from "./load";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

/** Same rule as the content sync (`sync.ts`): file name without extension, dots become dashes. */
export function slugOf(file: string): string {
  return path.basename(file, ".mdx").replaceAll(".", "-");
}

let index: Map<string, string> | undefined;

function lessonIndex(): Map<string, string> {
  index ??= new Map(
    walk(CONTENT_DIR)
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => [slugOf(f), f]),
  );
  return index;
}

/**
 * Resolves a lesson slug to its file through the content index (review finding H5). The path is
 * never built from the request: an unknown or malformed slug simply returns null.
 */
export function findLessonFile(slug: string): string | null {
  if (!SLUG.test(slug)) return null;
  return lessonIndex().get(slug) ?? null;
}
