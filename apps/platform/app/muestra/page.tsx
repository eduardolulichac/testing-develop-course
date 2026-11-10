import type { Metadata } from "next";
import path from "node:path";
import { LessonView } from "@/components/lesson/lesson-view";
import { FIXTURES_DIR, loadLesson } from "@/lib/content/load";

export const metadata: Metadata = {
  title: "Lección de muestra",
  robots: { index: false },
};

/** Public sample lesson that exercises every MDX component (no session required). */
export default async function SampleLessonPage() {
  const { frontmatter, Content } = await loadLesson(path.join(FIXTURES_DIR, "leccion-muestra.mdx"));
  return <LessonView frontmatter={frontmatter} Content={Content} />;
}
