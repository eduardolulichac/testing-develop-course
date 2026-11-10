"use client";

import { useActionState, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { exerciseStep, type ExerciseActionState } from "@/app/lecciones/[slug]/exercise-action";
import type { PublicExercise } from "@/lib/exercises/state";
import { Block } from "./blocks";

/**
 * Guided exercise with escalating hints. Each button is a form post to `exerciseStep`: the hint
 * text only reaches the browser after the server records that the student asked for it, and the
 * state survives reloads.
 */
export function ExerciseGuide({
  slug,
  initial,
  titulo,
  children,
}: {
  slug: string;
  initial: PublicExercise;
  titulo?: string;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState<ExerciseActionState, FormData>(
    exerciseStep,
    null,
  );
  const ex = state?.exercise ?? initial;
  const revealed = useRef<HTMLDivElement>(null);
  const resolved = useRef<HTMLSpanElement>(null);
  const previous = useRef({
    pistas: ex.pistas.length,
    solucion: ex.solucion,
    resuelto: ex.resuelto,
  });

  // After each step the focus goes to what just appeared (the buttons change or vanish, which
  // used to drop the focus on <body>); nothing moves on the first render (review H31).
  useEffect(() => {
    const before = previous.current;
    previous.current = { pistas: ex.pistas.length, solucion: ex.solucion, resuelto: ex.resuelto };
    const newContent = ex.pistas.length > before.pistas || ex.solucion !== before.solucion;
    if (newContent) revealed.current?.focus();
    else if (ex.resuelto && !before.resuelto) resolved.current?.focus();
  }, [ex.pistas.length, ex.solucion, ex.resuelto]);

  // `aria-disabled` keeps the focus on the button while it works; this ignores extra clicks.
  const ignoreWhilePending = (e: MouseEvent) => {
    if (pending) e.preventDefault();
  };

  return (
    <Block label="Ejercicio guiado" titulo={titulo ?? ex.titulo} testId="mdx-ejercicio">
      {children}
      <div className="space-y-2" data-testid="mdx-pistas" aria-live="polite">
        {ex.pistas.map((pista, i) => (
          <div
            key={i}
            ref={!ex.solucion && i === ex.pistas.length - 1 ? revealed : undefined}
            tabIndex={-1}
            data-testid={`pista-${i + 1}`}
            className="rounded-md border border-border bg-background px-3 py-2"
          >
            <p className="text-sm font-medium">
              Pista {i + 1} de {ex.totalPistas}
            </p>
            <p className="mt-1 text-sm">{pista}</p>
          </div>
        ))}
        {ex.solucion ? (
          <div
            ref={revealed}
            tabIndex={-1}
            data-testid="solucion"
            className="rounded-md border border-accent/40 bg-accent-soft px-3 py-2"
          >
            <p className="text-sm font-medium">Solución</p>
            <p className="mt-1 text-sm">{ex.solucion}</p>
          </div>
        ) : null}
      </div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="exercise" value={ex.slug} />
        {ex.next ? (
          <button
            type="submit"
            name="op"
            value={ex.next}
            aria-disabled={pending}
            onClick={ignoreWhilePending}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium aria-disabled:opacity-60"
          >
            {ex.next === "hint"
              ? `Ver pista ${ex.pistas.length + 1} de ${ex.totalPistas}`
              : "Ver la solución"}
          </button>
        ) : null}
        {ex.resuelto ? (
          <span
            ref={resolved}
            tabIndex={-1}
            data-testid="ejercicio-resuelto"
            className="text-sm font-medium text-accent"
          >
            Ejercicio resuelto
          </span>
        ) : (
          <button
            type="submit"
            name="op"
            value="solved"
            aria-disabled={pending}
            onClick={ignoreWhilePending}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground aria-disabled:opacity-60"
          >
            Marcar como resuelto
          </button>
        )}
        <span role="alert" className="text-sm text-danger">
          {state?.error}
        </span>
      </form>
    </Block>
  );
}
