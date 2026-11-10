import { submitFeedback } from "@/app/lecciones/[slug]/feedback-action";
import type { ModuleFeedback } from "@/lib/feedback/feedback";

/** «¿Cómo te fue con este módulo?»: 1 a 5 y un comentario corto opcional. */
export function LessonFeedback({
  lessonId,
  slug,
  previous,
}: {
  lessonId: string;
  slug: string;
  previous: ModuleFeedback | null;
}) {
  return (
    <form
      action={submitFeedback}
      data-testid="lesson-feedback"
      className="mt-6 border-t border-border pt-4"
    >
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="slug" value={slug} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Cómo te fue con este módulo?</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex items-center gap-1">
              <input
                type="radio"
                name="rating"
                value={n}
                required
                defaultChecked={previous?.rating === n}
              />
              {n}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">1 = muy difícil o confuso, 5 = claro y útil.</p>
      </fieldset>
      <label className="mt-3 block text-sm">
        Comentario (opcional, máximo 500 caracteres)
        <textarea
          name="comentario"
          maxLength={500}
          rows={3}
          defaultValue={previous?.comentario ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          {previous ? "Actualizar valoración" : "Enviar valoración"}
        </button>
        {previous ? (
          <span data-testid="feedback-saved" className="text-sm text-accent">
            ¡Gracias! Tu valoración está guardada.
          </span>
        ) : null}
      </div>
    </form>
  );
}
