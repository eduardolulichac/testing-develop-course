import Link from "next/link";

const PHASES = [
  { n: 0, title: "Fundamentos técnicos", level: "Base" },
  { n: 1, title: "Automatización UI", level: "Junior" },
  { n: 2, title: "Framework, API y CI/CD", level: "Semi Senior" },
  { n: 3, title: "Calidad avanzada", level: "Semi Senior sólido" },
  { n: 4, title: "IA aplicada a QA", level: "Senior en formación" },
  { n: 5, title: "Estrategia y liderazgo", level: "Senior / Lead" },
] as const;

export default function HomePage() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <section>
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
          Curso gratuito · 43 módulos
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          De QA manual a QA Automation Senior, con IA como copiloto.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Aprende paso a paso con lecciones cortas, una tienda de práctica llena de defectos reales
          y retos evaluados en tu propio repositorio de GitHub.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/registro"
            className="rounded-md bg-accent px-5 py-3 font-medium text-accent-foreground hover:opacity-90"
          >
            Empezar gratis
          </Link>
          <Link
            href="/roadmap"
            className="rounded-md border border-border px-5 py-3 font-medium hover:bg-accent-soft"
          >
            Ver el roadmap
          </Link>
        </div>
      </section>

      <section aria-labelledby="fases" className="rounded-lg border border-border bg-surface p-5">
        <h2 id="fases" className="mb-4 text-sm font-medium text-muted">
          Seis fases, un camino
        </h2>
        <ol className="space-y-3">
          {PHASES.map((phase) => (
            <li key={phase.n} className="flex items-baseline gap-3">
              <span className="w-6 shrink-0 font-mono text-sm text-accent">{phase.n}</span>
              <span className="flex-1">{phase.title}</span>
              <span className="text-xs text-muted">{phase.level}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
