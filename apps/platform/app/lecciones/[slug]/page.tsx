import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AbandonTracker } from "@/components/analytics/abandon-tracker";
import { DonationQr } from "@/components/donations/donation-qr";
import { LessonFeedback } from "@/components/lesson/lesson-feedback";
import { LessonView } from "@/components/lesson/lesson-view";
import { track } from "@/lib/analytics/server";
import { donationOptions } from "@/lib/donations/config";
import { findLessonFile } from "@/lib/content/index";
import { getModuleFeedback } from "@/lib/feedback/feedback";
import { loadLesson } from "@/lib/content/load";
import { loadExercises } from "@/lib/exercises/load";
import { getExerciseStates } from "@/lib/exercises/queries";
import { getLessonPage, getQuizSummary, startLesson } from "@/lib/lessons/queries";
import { toPublic } from "@/lib/quiz/grade";
import { loadQuiz } from "@/lib/quiz/load";
import { extractToc } from "@/lib/lessons/toc";
import { getCurrentUserId } from "@/lib/supabase/server";
import { completeLesson } from "./actions";

export const metadata: Metadata = { title: "Lección" };

export default async function LessonPage({ params }: PageProps<"/lecciones/[slug]">) {
  const { slug } = await params;
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=/lecciones/${encodeURIComponent(slug)}`);

  // Both must agree: the file comes from the content index, publication from the database (RLS).
  const file = findLessonFile(slug);
  const page = file ? await getLessonPage(slug, userId) : null;
  if (!file || !page) notFound();

  const { frontmatter, body, Content } = await loadLesson(file);
  const firstVisit = await startLesson(page.id);
  if (firstVisit) {
    await track(userId, "lesson_started", { modulo: frontmatter.modulo, leccion: slug });
  }
  const bank = await loadQuiz(file, frontmatter.modulo);
  const exercises = await getExerciseStates(
    userId,
    page.id,
    await loadExercises(file, frontmatter.modulo),
  );
  const feedback = page.completed ? await getModuleFeedback(page.id) : null;
  const toc = extractToc(body);
  const attempts = bank ? await getQuizSummary(page.id, userId) : null;

  return (
    <LessonView
      frontmatter={frontmatter}
      Content={Content}
      lessonSlug={slug}
      exercises={exercises}
      quiz={
        bank ? { slug, preguntas: toPublic(bank, userId ?? "anon"), previous: attempts } : undefined
      }
      toc={toc}
      prev={page.prev}
      next={page.next}
      footer={
        <>
          {!page.completed ? (
            <AbandonTracker
              modulo={frontmatter.modulo}
              leccion={slug}
              sections={toc.map((e) => e.id)}
            />
          ) : null}
          <section
            aria-label="Progreso de la lección"
            className="mt-10 rounded-lg border border-border bg-surface p-4"
          >
            {page.completed ? (
              <p data-testid="lesson-completed" className="font-medium text-accent">
                Lección completada. ¡Buen trabajo!
              </p>
            ) : (
              <form action={completeLesson} className="flex items-center justify-between gap-4">
                <input type="hidden" name="lessonId" value={page.id} />
                <input type="hidden" name="slug" value={slug} />
                <p className="text-sm text-muted">¿Terminaste? Marca la lección como completada.</p>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                >
                  Marcar como completada
                </button>
              </form>
            )}
            {page.completed ? (
              <LessonFeedback lessonId={page.id} slug={slug} previous={feedback} />
            ) : null}
            {page.completed ? <DonationQr options={donationOptions()} ubicacion="leccion" /> : null}
          </section>
        </>
      }
    />
  );
}
