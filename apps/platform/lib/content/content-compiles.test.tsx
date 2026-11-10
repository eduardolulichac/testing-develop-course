import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lessonComponents } from "@/components/lesson/mdx-components";

vi.mock("server-only", () => ({}));

const { CONTENT_DIR, LESSON_COMPONENT_NAMES, loadLesson } = await import("./load");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

describe("lesson content", () => {
  it("allow-list matches the MDX components that exist", () => {
    const components = Object.keys(lessonComponents).filter((k) => /^[A-Z]/.test(k));
    expect([...LESSON_COMPONENT_NAMES].sort()).toEqual(components.sort());
  });

  const files = walk(CONTENT_DIR).filter((f) => f.endsWith(".mdx"));
  it("finds the lesson files", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files.map((f) => [path.relative(CONTENT_DIR, f), f] as const))(
    "%s compiles under the safe MDX rules",
    async (_label, file) => {
      await expect(loadLesson(file)).resolves.toBeTruthy();
    },
  );
});
