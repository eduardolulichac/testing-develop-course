import { describe, expect, it } from "vitest";
import { buildRoadmap, type RoadmapModule, type RoadmapPhase } from "./state";

function lesson(slug: string, orden: number, state: "new" | "started" | "done" = "new") {
  return { slug, titulo: slug, orden, started: state !== "new", completed: state === "done" };
}

function mod(
  codigo: string,
  orden: number,
  prerequisitos: string[],
  lessons: RoadmapModule["lessons"],
) {
  return { codigo, titulo: `Módulo ${codigo}`, orden, prerequisitos, lessons };
}

function phase(orden: number, modules: RoadmapModule[]): RoadmapPhase {
  return {
    orden,
    titulo: `Fase ${orden}`,
    nivelObjetivo: "Junior",
    semanaInicio: 1,
    semanaFin: 2,
    modules,
  };
}

const statuses = (phases: RoadmapPhase[]) =>
  Object.fromEntries(
    buildRoadmap(phases).phases.flatMap((p) => p.modules.map((m) => [m.codigo, m.status])),
  );

describe("buildRoadmap", () => {
  it("marks modules without published lessons as proximamente", () => {
    expect(statuses([phase(0, [mod("0.1", 1, [], [])])])).toEqual({ "0.1": "proximamente" });
  });

  it("walks the linear chain: completado, en_curso, bloqueado", () => {
    const result = statuses([
      phase(0, [
        mod("0.1", 1, [], [lesson("a", 1, "done")]),
        mod("0.2", 2, ["0.1"], [lesson("b", 1, "started")]),
        mod("0.3", 3, ["0.2"], [lesson("c", 1)]),
      ]),
    ]);
    expect(result).toEqual({ "0.1": "completado", "0.2": "en_curso", "0.3": "bloqueado" });
  });

  it("unlocks a module once its prerequisite is completed", () => {
    const result = statuses([
      phase(0, [
        mod("0.1", 1, [], [lesson("a", 1, "done")]),
        mod("0.2", 2, ["0.1"], [lesson("b", 1)]),
      ]),
    ]);
    expect(result["0.2"]).toBe("disponible");
  });

  it("needs every lesson completed to complete a module", () => {
    const view = buildRoadmap([
      phase(0, [mod("0.1", 1, [], [lesson("a", 1, "done"), lesson("b", 2)])]),
    ]).phases[0]!.modules[0]!;
    expect(view.status).toBe("en_curso");
    expect(view.completedLessons).toBe(1);
    expect(view.nextLessonSlug).toBe("b");
  });

  it("does not let unreleased prerequisites block the path", () => {
    const result = statuses([
      phase(0, [mod("0.1", 1, [], []), mod("0.2", 2, ["0.1"], [lesson("b", 1)])]),
    ]);
    expect(result["0.2"]).toBe("disponible");
  });

  it("blocks across phases and lists pending prerequisites", () => {
    const view = buildRoadmap([
      phase(1, [mod("1.1", 1, ["0.1"], [lesson("x", 1)])]),
      phase(0, [mod("0.1", 1, [], [lesson("a", 1)])]),
    ]);
    expect(view.phases.map((p) => p.orden)).toEqual([0, 1]);
    const m = view.phases[1]!.modules[0]!;
    expect(m.status).toBe("bloqueado");
    expect(m.pendingPrerequisites).toEqual(["0.1"]);
  });

  it("reports progress over released modules only", () => {
    const view = buildRoadmap([
      phase(0, [
        mod("0.1", 1, [], [lesson("a", 1, "done")]),
        mod("0.2", 2, ["0.1"], [lesson("b", 1)]),
        mod("0.3", 3, ["0.2"], []),
      ]),
    ]);
    expect(view.totalModules).toBe(3);
    expect(view.releasedModules).toBe(2);
    expect(view.completedModules).toBe(1);
    expect(view.percent).toBe(50);
    expect(view.phases[0]!.completedModules).toBe(1);
  });

  it("returns 0% with no released content", () => {
    expect(buildRoadmap([]).percent).toBe(0);
    expect(buildRoadmap([phase(0, [mod("0.1", 1, [], [])])]).percent).toBe(0);
  });
});
