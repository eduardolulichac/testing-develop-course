export type ModuleStatus = "completado" | "en_curso" | "disponible" | "bloqueado" | "proximamente";

export type RoadmapLesson = {
  slug: string;
  titulo: string;
  orden: number;
  completed: boolean;
  started: boolean;
};

export type RoadmapModule = {
  codigo: string;
  titulo: string;
  orden: number;
  prerequisitos: string[];
  lessons: RoadmapLesson[];
};

export type RoadmapPhase = {
  orden: number;
  titulo: string;
  nivelObjetivo: string;
  semanaInicio: number;
  semanaFin: number;
  modules: RoadmapModule[];
};

export type ModuleView = RoadmapModule & {
  status: ModuleStatus;
  completedLessons: number;
  /** Codes of prerequisites not completed yet. Advisory only: the module can still be opened (H18). */
  pendingPrerequisites: string[];
  /** Slug of the lesson to open: first unfinished, or the first one when all are done. */
  nextLessonSlug: string | null;
};

export type PhaseView = Omit<RoadmapPhase, "modules"> & {
  modules: ModuleView[];
  completedModules: number;
};

export type RoadmapView = {
  phases: PhaseView[];
  completedModules: number;
  totalModules: number;
  /** Modules with at least one published lesson: the base of `percent` and of the progress text. */
  releasedModules: number;
  /** 0..100, over modules that already have published lessons. */
  percent: number;
};

/**
 * Computes the per-user state of every module.
 *
 * - `proximamente`: no published lessons yet (the student cannot see drafts).
 * - `completado`: every published lesson is completed.
 * - `en_curso`: some lesson started or completed.
 * - `bloqueado`: nothing started and a prerequisite is pending. Advisory, not enforced.
 * - `disponible`: nothing started and prerequisites are met.
 *
 * A prerequisite counts as met when its module is `completado`; a prerequisite without published
 * lessons counts as met, so unreleased content never blocks the path.
 */
export function buildRoadmap(phases: RoadmapPhase[]): RoadmapView {
  const sorted = [...phases].sort((a, b) => a.orden - b.orden);
  const done = new Set<string>();
  const unreleased = new Set<string>();
  for (const phase of sorted) {
    for (const m of phase.modules) {
      if (m.lessons.length === 0) unreleased.add(m.codigo);
      else if (m.lessons.every((l) => l.completed)) done.add(m.codigo);
    }
  }

  let completedModules = 0;
  let released = 0;
  const views = sorted.map((phase): PhaseView => {
    const modules = [...phase.modules]
      .sort((a, b) => a.orden - b.orden)
      .map((m): ModuleView => {
        const lessons = [...m.lessons].sort((a, b) => a.orden - b.orden);
        const completedLessons = lessons.filter((l) => l.completed).length;
        const pendingPrerequisites = m.prerequisitos.filter(
          (c) => !done.has(c) && !unreleased.has(c),
        );
        const status = moduleStatus(lessons, completedLessons, pendingPrerequisites);
        const next = lessons.find((l) => !l.completed) ?? lessons[0];
        if (lessons.length > 0) released += 1;
        if (status === "completado") completedModules += 1;
        return {
          ...m,
          lessons,
          status,
          completedLessons,
          pendingPrerequisites,
          nextLessonSlug: next?.slug ?? null,
        };
      });
    return {
      ...phase,
      modules,
      completedModules: modules.filter((m) => m.status === "completado").length,
    };
  });

  return {
    phases: views,
    completedModules,
    totalModules: sorted.reduce((n, p) => n + p.modules.length, 0),
    releasedModules: released,
    percent: released === 0 ? 0 : Math.round((completedModules / released) * 100),
  };
}

function moduleStatus(
  lessons: RoadmapLesson[],
  completedLessons: number,
  pendingPrerequisites: string[],
): ModuleStatus {
  if (lessons.length === 0) return "proximamente";
  if (completedLessons === lessons.length) return "completado";
  if (completedLessons > 0 || lessons.some((l) => l.started)) return "en_curso";
  return pendingPrerequisites.length > 0 ? "bloqueado" : "disponible";
}
