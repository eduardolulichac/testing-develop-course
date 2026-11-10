"use client";

import { useActionState, useEffect, useId, useRef, useTransition, type FormEvent } from "react";
import { submitQuiz, type QuizState } from "@/app/lecciones/[slug]/quiz-action";
import type { PublicQuestion } from "@/lib/quiz/grade";
import type { AttemptSummary } from "@/lib/quiz/summary";

/**
 * Graded quiz. The browser only has the questions and options; the grade and the explanations
 * come back from the `submitQuiz` server action after submitting.
 */
export function QuizForm({
  slug,
  titulo = "Autoevaluación",
  preguntas,
  previous = null,
}: {
  slug: string;
  titulo?: string;
  preguntas: PublicQuestion[];
  /** Attempts made before this page load; the live result replaces it after submitting. */
  previous?: AttemptSummary | null;
}) {
  const baseId = useId();
  const [state, action, pending] = useActionState<QuizState, FormData>(submitQuiz, null);
  const [, startTransition] = useTransition();
  const scoreRef = useRef<HTMLDivElement>(null);
  const result = state?.result;

  // `<form action>` makes React 19 reset the radios after the action finishes, which erased the
  // student's choices (review H28). Submitting through `onSubmit` keeps them.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  // Move the focus to the result so keyboard and screen-reader users land on the grade.
  useEffect(() => {
    if (state) scoreRef.current?.focus();
  }, [state]);

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby={`${baseId}-titulo`}
      data-testid="mdx-quiz"
      className="my-6 space-y-5 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <h3 id={`${baseId}-titulo`} className="text-lg font-semibold">
        {titulo}
      </h3>
      {previous ? (
        <p data-testid="quiz-previous" className="text-sm text-muted">
          Tu mejor nota: {previous.mejor} · Último intento: {previous.ultima} · Intentos:{" "}
          {previous.intentos}
        </p>
      ) : null}
      <input type="hidden" name="slug" value={slug} />
      {preguntas.map((q, i) => {
        const r = result?.resultados.find((x) => x.id === q.id);
        return (
          <fieldset
            key={q.id}
            className="space-y-2"
            data-testid={`quiz-q-${q.id}`}
            aria-describedby={r ? `${baseId}-fb-${q.id}` : undefined}
          >
            <legend className="font-medium">
              <span className="text-muted">{i + 1}. </span>
              {q.enunciado}
            </legend>
            {q.orden.map((j) => {
              const opcion = q.opciones[j];
              const id = `${baseId}-${i}-${j}`;
              return (
                <div key={j} className="flex items-start gap-3">
                  <input
                    type="radio"
                    id={id}
                    name={`q:${q.id}`}
                    value={j}
                    className="mt-1.5 size-4 accent-[var(--accent)]"
                  />
                  <label htmlFor={id} className="min-h-6 cursor-pointer">
                    {opcion}
                  </label>
                </div>
              );
            })}
            {r ? (
              <p
                id={`${baseId}-fb-${q.id}`}
                data-testid={`quiz-feedback-${q.id}`}
                className={`rounded-md p-3 text-sm ${r.acierto ? "bg-accent-soft" : "bg-danger-soft"}`}
              >
                <strong>
                  {r.acierto
                    ? "Correcta. "
                    : r.elegida === null
                      ? "Sin responder. "
                      : "Incorrecta. "}
                </strong>
                {!r.acierto ? `La respuesta es: ${q.opciones[r.correcta]}. ` : null}
                {r.explicacion}
              </p>
            ) : null}
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          aria-disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground aria-disabled:opacity-60"
        >
          {pending ? "Corrigiendo…" : result ? "Corregir de nuevo" : "Corregir"}
        </button>
        <div
          ref={scoreRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          data-testid="quiz-score"
          className="text-sm outline-offset-4"
        >
          {result ? (
            <span className="font-medium">
              Nota: {result.nota} ({result.aciertos} de {result.total})
            </span>
          ) : null}
          {state?.error ? <span className="text-danger">{state.error}</span> : null}
        </div>
      </div>
    </form>
  );
}
