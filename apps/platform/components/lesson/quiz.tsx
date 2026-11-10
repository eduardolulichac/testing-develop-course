import { useId } from "react";

export type QuizQuestion = { pregunta: string; opciones: string[] };

/**
 * Self-assessment questionnaire. It only PRESENTS the questions and options (native radio
 * groups, usable without JavaScript); grading and explanations are built in E2-C1.
 */
export function Quiz({
  titulo = "Autoevaluación",
  preguntas,
}: {
  titulo?: string;
  preguntas?: QuizQuestion[];
}) {
  const baseId = useId();
  // A bare `<Quiz />` needs a server-side bank (see `QuizForm`); without one there is nothing to show.
  if (!preguntas) return null;
  return (
    <form
      aria-labelledby={`${baseId}-titulo`}
      data-testid="mdx-quiz"
      className="my-6 space-y-5 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <h3 id={`${baseId}-titulo`} className="text-lg font-semibold">
        {titulo}
      </h3>
      {preguntas.map((q, i) => (
        <fieldset key={i} className="space-y-2">
          <legend className="font-medium">
            <span className="text-muted">{i + 1}. </span>
            {q.pregunta}
          </legend>
          {q.opciones.map((opcion, j) => {
            const id = `${baseId}-${i}-${j}`;
            return (
              <div key={j} className="flex items-start gap-3">
                <input
                  type="radio"
                  id={id}
                  name={`${baseId}-${i}`}
                  value={j}
                  className="mt-1.5 size-4 accent-[var(--accent)]"
                />
                <label htmlFor={id} className="min-h-6 cursor-pointer">
                  {opcion}
                </label>
              </div>
            );
          })}
        </fieldset>
      ))}
    </form>
  );
}
