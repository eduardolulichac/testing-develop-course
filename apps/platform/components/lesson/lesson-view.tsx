import type { LessonFrontmatter } from "@course/shared";
import type { MDXComponents, MDXContent } from "mdx/types";
import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import type { TocEntry } from "@/lib/lessons/toc";
import type { PublicQuestion } from "@/lib/quiz/grade";
import type { AttemptSummary } from "@/lib/quiz/summary";
import { lessonComponents } from "./mdx-components";
import type { PublicExercise } from "@/lib/exercises/state";
import { Ejercicio, Reto } from "./blocks";
import { ExerciseGuide } from "./exercise-guide";
import { Quiz, type QuizQuestion } from "./quiz";
import { QuizForm } from "./quiz-form";

export type LessonLink = { slug: string; titulo: string };

/**
 * Page frame for one lesson: header built from the validated frontmatter, the MDX body and, when
 * given, a side index, previous/next links and a footer slot (completion).
 */
export function LessonView({
  frontmatter,
  Content,
  toc = [],
  prev = null,
  next = null,
  footer,
  quiz,
  exercises,
  lessonSlug,
}: {
  frontmatter: LessonFrontmatter;
  Content: MDXContent;
  toc?: TocEntry[];
  prev?: LessonLink | null;
  next?: LessonLink | null;
  footer?: ReactNode;
  /** Lesson slug, needed by the interactive blocks (quiz, guided exercises) to post to the server. */
  lessonSlug?: string;
  /** Guided exercises of the lesson by slug, with the user's saved state (server-side bank). */
  exercises?: Record<string, PublicExercise>;
  /** Server-held quiz bank (questions only): renders in place of a bare `<Quiz />`. */
  quiz?: { slug: string; preguntas: PublicQuestion[]; previous?: AttemptSummary | null };
}) {
  const components: MDXComponents = {
    ...lessonComponents,
    // `<Ejercicio id="..." />` takes its hints from the server-side bank; without `id` (or when the
    // exercise is not synced yet) it keeps the static block.
    // The challenge block links to the page where the student links a repo and sees the history.
    Reto: (props: { titulo?: string; children?: ReactNode }) => (
      <Reto titulo={props.titulo}>
        {props.children}
        {frontmatter.reto ? (
          <p>
            <Link
              href={`/retos/${frontmatter.reto}`}
              className="text-accent"
              data-testid="reto-link"
            >
              Ir al reto y ver tus entregas →
            </Link>
          </p>
        ) : null}
      </Reto>
    ),
    Ejercicio: (props: {
      id?: string;
      titulo?: string;
      pistas?: string[];
      children?: ReactNode;
    }) => {
      const initial = props.id ? exercises?.[props.id] : undefined;
      return initial && lessonSlug ? (
        <ExerciseGuide slug={lessonSlug} initial={initial} titulo={props.titulo}>
          {props.children}
        </ExerciseGuide>
      ) : (
        <Ejercicio titulo={props.titulo} pistas={props.pistas}>
          {props.children}
        </Ejercicio>
      );
    },
    ...(quiz
      ? {
          // `<Quiz />` without props takes its questions from the server-side bank.
          Quiz: (props: { titulo?: string; preguntas?: QuizQuestion[] }) =>
            props.preguntas ? (
              <Quiz titulo={props.titulo} preguntas={props.preguntas} />
            ) : (
              <QuizForm
                slug={quiz.slug}
                titulo={props.titulo}
                preguntas={quiz.preguntas}
                previous={quiz.previous}
              />
            ),
        }
      : {}),
  };
  const { modulo, titulo, nivel, duracion_min, herramientas, version } = frontmatter;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,48rem)_14rem] lg:gap-12">
      <article className="max-w-3xl" data-testid="lesson">
        <PageHeader eyebrow={`Módulo ${modulo} · ${nivel}`} title={titulo}>
          <p>
            {duracion_min} min · Revisada {version}
            {herramientas.length ? ` · ${herramientas.join(", ")}` : ""}
          </p>
        </PageHeader>
        <Content components={components} />
        {footer}
        {prev || next ? (
          <nav
            aria-label="Navegación entre lecciones"
            className="mt-10 flex justify-between gap-4 border-t border-border pt-6 text-sm"
          >
            {prev ? (
              <Link href={`/lecciones/${prev.slug}`} rel="prev" className="text-accent">
                ← {prev.titulo}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/lecciones/${next.slug}`} rel="next" className="text-right text-accent">
                {next.titulo} →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </article>
      {toc.length > 0 ? (
        <nav aria-label="En esta lección" className="hidden text-sm lg:block">
          <div className="sticky top-6">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              En esta lección
            </p>
            <ul className="space-y-1.5 border-l border-border">
              {toc.map((e) => (
                <li key={e.id}>
                  <a
                    href={`#${e.id}`}
                    className="-ml-px block border-l border-transparent pl-3 text-muted hover:border-accent hover:text-foreground"
                  >
                    {e.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
