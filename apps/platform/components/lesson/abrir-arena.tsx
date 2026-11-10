import { ArenaLink } from "@/components/analytics/arena-link";
import { buildArenaUrl } from "@/lib/arena";

/**
 * Link to a QA Arena scenario. The scenario engine is not built yet: this only links to
 * `NEXT_PUBLIC_ARENA_URL` with the scenario id as the `escenario` query parameter. When the
 * variable is missing (or the id is invalid) it renders a plain note instead of a broken link.
 */
export function AbrirArena({ escenario, children }: { escenario: string; children?: string }) {
  const href = buildArenaUrl(escenario);
  if (!href) {
    return (
      <p
        data-testid="mdx-abrir-arena-unavailable"
        className="my-6 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted"
      >
        QA Arena no está disponible en este entorno todavía (escenario: <code>{escenario}</code>).
      </p>
    );
  }
  return (
    <p className="my-6">
      <ArenaLink
        href={href}
        escenario={escenario}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90"
      >
        {children ?? "Abrir en QA Arena"}
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
        <span aria-hidden="true">↗</span>
      </ArenaLink>
    </p>
  );
}
