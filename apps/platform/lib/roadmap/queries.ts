import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildRoadmap, type RoadmapPhase, type RoadmapView } from "./state";

type PhaseRow = {
  orden: number;
  titulo: string;
  nivel_objetivo: string;
  semana_inicio: number;
  semana_fin: number;
  modules: {
    codigo: string;
    titulo: string;
    orden: number;
    prerequisitos: string[];
    lessons: { id: string; slug: string; titulo: string; orden: number }[];
  }[];
};

type ProgressRow = { lesson_id: string; estado: "en_curso" | "completada" };

/**
 * Reads the course tree and the signed-in user's progress through RLS: students only see
 * published lessons, and only their own `progress` rows. Returns null when signed out.
 */
export async function getRoadmap(userId: string): Promise<RoadmapView | null> {
  const supabase = await createClient();
  const [tree, progress] = await Promise.all([
    supabase
      .from("phases")
      .select(
        "orden, titulo, nivel_objetivo, semana_inicio, semana_fin, modules(codigo, titulo, orden, prerequisitos, lessons(id, slug, titulo, orden))",
      )
      .order("orden")
      .returns<PhaseRow[]>(),
    supabase
      .from("progress")
      .select("lesson_id, estado")
      .eq("user_id", userId)
      .returns<ProgressRow[]>(),
  ]);
  if (tree.error || progress.error) return null;

  const byLesson = new Map(progress.data.map((p) => [p.lesson_id, p.estado]));
  const phases: RoadmapPhase[] = tree.data.map((p) => ({
    orden: p.orden,
    titulo: p.titulo,
    nivelObjetivo: p.nivel_objetivo,
    semanaInicio: p.semana_inicio,
    semanaFin: p.semana_fin,
    modules: p.modules.map((m) => ({
      codigo: m.codigo,
      titulo: m.titulo,
      orden: m.orden,
      prerequisitos: m.prerequisitos,
      lessons: m.lessons.map((l) => ({
        slug: l.slug,
        titulo: l.titulo,
        orden: l.orden,
        started: byLesson.has(l.id),
        completed: byLesson.get(l.id) === "completada",
      })),
    })),
  }));
  return buildRoadmap(phases);
}
