import { useId, type ReactNode } from "react";

type Tone = "accent" | "neutral" | "danger";

const TONE_CLASSES: Record<Tone, { box: string; label: string }> = {
  accent: { box: "border-accent/40 bg-accent-soft", label: "text-accent" },
  neutral: { box: "border-border bg-surface", label: "text-muted" },
  danger: { box: "border-danger/40 bg-danger-soft", label: "text-danger" },
};

/**
 * Shared frame of every lesson block: a labelled `<section>`. The visible label is the
 * accessible name; an optional `titulo` becomes an `<h3>` (blocks sit under the lesson's `<h2>`
 * sections written in the MDX).
 */
export function Block({
  tone = "neutral",
  label,
  titulo,
  testId,
  children,
}: {
  tone?: Tone;
  label: string;
  titulo?: string;
  testId: string;
  children?: ReactNode;
}) {
  const labelId = useId();
  const styles = TONE_CLASSES[tone];
  return (
    <section
      aria-labelledby={labelId}
      data-testid={testId}
      className={`my-6 rounded-lg border p-4 sm:p-5 ${styles.box}`}
    >
      <p
        id={labelId}
        className={`font-mono text-xs font-semibold uppercase tracking-widest ${styles.label}`}
      >
        {label}
      </p>
      {titulo ? <h3 className="mt-1 text-lg font-semibold text-balance">{titulo}</h3> : null}
      <div className="mt-3 space-y-3 [&>:first-child]:mt-0 [&>:last-child]:mb-0">{children}</div>
    </section>
  );
}

type BlockProps = { children?: ReactNode };

/** Section 1: what real QA problem the lesson solves. */
export function Objetivo({ children }: BlockProps) {
  return (
    <Block tone="accent" label="Objetivo" testId="mdx-objetivo">
      {children}
    </Block>
  );
}

/** Step of the explanation. `numero` is shown in the label ("Paso 2"). */
export function Paso({
  numero,
  titulo,
  children,
}: BlockProps & { numero?: number; titulo?: string }) {
  return (
    <Block label={numero ? `Paso ${numero}` : "Paso"} titulo={titulo} testId="mdx-paso">
      {children}
    </Block>
  );
}

/** Fully worked example. */
export function Ejemplo({ titulo, children }: BlockProps & { titulo?: string }) {
  return (
    <Block label="Ejemplo resuelto" titulo={titulo} testId="mdx-ejemplo">
      {children}
    </Block>
  );
}

/**
 * Guided exercise. `pistas` are escalating hints, hidden in native `<details>` (keyboard and
 * screen-reader friendly, no JavaScript needed). Order them from vaguest to most explicit.
 */
export function Ejercicio({
  titulo,
  pistas,
  children,
}: BlockProps & { titulo?: string; pistas?: string[] }) {
  return (
    <Block label="Ejercicio guiado" titulo={titulo} testId="mdx-ejercicio">
      {children}
      {pistas?.length ? (
        <div className="space-y-2" data-testid="mdx-pistas">
          {pistas.map((pista, i) => (
            <details key={i} className="rounded-md border border-border bg-background px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                Pista {i + 1} de {pistas.length}
              </summary>
              <p className="mt-2 text-sm">{pista}</p>
            </details>
          ))}
        </div>
      ) : null}
    </Block>
  );
}

/** Unguided challenge (delivered via GitHub and graded by automatic tests). */
export function Reto({ titulo, children }: BlockProps & { titulo?: string }) {
  return (
    <Block tone="accent" label="Reto sin guía" titulo={titulo} testId="mdx-reto">
      {children}
    </Block>
  );
}

/** Key takeaways (5 to 8 bullet points). */
export function Resumen({ children }: BlockProps) {
  return (
    <Block tone="accent" label="Resumen" testId="mdx-resumen">
      {children}
    </Block>
  );
}

/** A typical mistake and how to avoid it. */
export function ErrorComun({ titulo, children }: BlockProps & { titulo?: string }) {
  return (
    <Block tone="danger" label="Error común" titulo={titulo} testId="mdx-error-comun">
      {children}
    </Block>
  );
}
