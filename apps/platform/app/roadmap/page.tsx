import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DonationQr } from "@/components/donations/donation-qr";
import { EmptyState, PageHeader } from "@/components/page-header";
import { donationOptions } from "@/lib/donations/config";
import { getRoadmap } from "@/lib/roadmap/queries";
import type { ModuleStatus, ModuleView } from "@/lib/roadmap/state";
import { getCurrentUserId } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roadmap" };

const STATUS_LABEL: Record<ModuleStatus, string> = {
  completado: "Completado",
  en_curso: "En curso",
  disponible: "Disponible",
  bloqueado: "Recomendado después",
  proximamente: "Próximamente",
};

const STATUS_STYLE: Record<ModuleStatus, string> = {
  completado: "bg-accent-soft text-accent",
  en_curso: "bg-accent text-accent-foreground",
  disponible: "border border-border text-foreground",
  bloqueado: "border border-dashed border-border text-muted",
  proximamente: "border border-dashed border-border text-muted",
};

export default async function RoadmapPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?next=/roadmap");
  const roadmap = await getRoadmap(userId);

  return (
    <>
      <PageHeader eyebrow="Tu camino" title="Roadmap">
        Fases y módulos del curso con tu avance.
      </PageHeader>
      {!roadmap ? (
        <EmptyState title="No pudimos cargar el roadmap">
          Hubo un problema al leer tu avance. Recarga la página en unos minutos.
        </EmptyState>
      ) : roadmap.phases.length === 0 ? (
        <EmptyState title="El roadmap todavía no tiene módulos">
          Los módulos aparecerán aquí cuando se publique el contenido.
        </EmptyState>
      ) : (
        <>
          <div className="mb-10 max-w-2xl" data-testid="roadmap-progress">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-medium">Tu progreso</span>
              <span className="text-muted">
                {roadmap.completedModules} de {roadmap.releasedModules}{" "}
                {roadmap.releasedModules === 1 ? "módulo disponible" : "módulos disponibles"} ·{" "}
                {roadmap.percent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Progreso del curso"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={roadmap.percent}
              className="h-2 overflow-hidden rounded-full bg-border"
            >
              <div className="h-full bg-accent" style={{ width: `${roadmap.percent}%` }} />
            </div>
          </div>
          <div className="flex flex-col gap-12">
            {roadmap.phases.map((phase) => (
              <section key={phase.orden} aria-labelledby={`fase-${phase.orden}`}>
                <h2 id={`fase-${phase.orden}`} className="text-lg font-semibold">
                  Fase {phase.orden}: {phase.titulo}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Semanas {phase.semanaInicio}–{phase.semanaFin} · Nivel objetivo:{" "}
                  {phase.nivelObjetivo} · {phase.completedModules} de {phase.modules.length} módulos
                  completados
                </p>
                <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                  {phase.modules.map((m) => (
                    <li key={m.codigo}>
                      <ModuleCard module={m} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <DonationQr options={donationOptions()} ubicacion="panel" />
        </>
      )}
    </>
  );
}

function ModuleCard({ module: m }: { module: ModuleView }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs text-muted">{m.codigo}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[m.status]}`}
          data-testid={`module-status-${m.codigo}`}
        >
          {STATUS_LABEL[m.status]}
        </span>
      </div>
      <h3 className="mt-2 font-medium">{m.titulo}</h3>
      {m.lessons.length > 0 ? (
        <p className="mt-1 text-xs text-muted">
          {m.completedLessons} de {m.lessons.length} lecciones
        </p>
      ) : null}
      {m.status === "bloqueado" ? (
        <p className="mt-2 text-xs text-muted">
          Te conviene completar antes: {m.pendingPrerequisites.join(", ")}. Puedes entrar
          igualmente.
        </p>
      ) : null}
    </>
  );
  const className = "block h-full rounded-lg border border-border bg-surface p-4";
  if (!m.nextLessonSlug) return <div className={`${className} opacity-70`}>{body}</div>;
  return (
    <Link href={`/lecciones/${m.nextLessonSlug}`} className={`${className} hover:border-accent`}>
      {body}
    </Link>
  );
}
