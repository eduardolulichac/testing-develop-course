import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  exerciseSchema,
  quizSchema,
  compareModuleCodes,
  findTodoMarkers,
  lessonFrontmatterSchema,
  validateLessonFrontmatter,
} from "./content-schema";

const valid: z.input<typeof lessonFrontmatterSchema> = {
  modulo: "1.2",
  titulo: "Localizadores estables",
  fase: 1,
  nivel: "Junior",
  duracion_min: 45,
  prerequisitos: ["1.1"],
  escenario: "fase1-localizadores",
  reto: "reto-1-2-localizadores",
  version: "2026-11",
  herramientas: ["Playwright 1.x"],
};

const required = [
  "modulo",
  "titulo",
  "fase",
  "nivel",
  "duracion_min",
  "prerequisitos",
  "version",
  "herramientas",
] as const;

describe("validateLessonFrontmatter", () => {
  it("accepts a valid frontmatter", () => {
    expect(validateLessonFrontmatter(valid).success).toBe(true);
  });

  it("accepts it without optional escenario and reto", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.escenario;
    delete rest.reto;
    expect(validateLessonFrontmatter(rest).success).toBe(true);
  });

  it.each(required)("fails when required field %s is missing", (field) => {
    const input: Record<string, unknown> = { ...valid };
    delete input[field];
    const result = validateLessonFrontmatter(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join("\n")).toContain(field);
  });

  it.each([
    ["modulo", "1"],
    ["modulo", "6.1"],
    ["modulo", "1.2.3"],
    ["modulo", "a.b"],
    ["fase", 6],
    ["fase", -1],
    ["fase", 1.5],
    ["nivel", "Experto"],
    ["duracion_min", 0],
    ["duracion_min", "45"],
    ["prerequisitos", ["uno"]],
    ["prerequisitos", ["1.2"]],
    ["prerequisitos", ["1.1", "1.1"]],
    ["version", "2026-13"],
    ["version", "noviembre"],
    ["escenario", "Fase 1"],
    ["reto", ""],
    ["herramientas", [""]],
  ])("fails when %s is %j", (field, value) => {
    expect(validateLessonFrontmatter({ ...valid, [field]: value }).success).toBe(false);
  });

  it("fails when fase does not match the module", () => {
    expect(validateLessonFrontmatter({ ...valid, fase: 2, nivel: "Semi Senior" }).success).toBe(
      false,
    );
  });

  it("fails when nivel does not match the phase", () => {
    expect(validateLessonFrontmatter({ ...valid, nivel: "Senior / Lead" }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(validateLessonFrontmatter({ ...valid, extra: true }).success).toBe(false);
  });
});

describe("compareModuleCodes", () => {
  it("orders numerically", () => {
    expect(["1.10", "1.2", "0.5"].sort(compareModuleCodes)).toEqual(["0.5", "1.2", "1.10"]);
  });
});

const question = (id: string) => ({
  id,
  enunciado: "¿Qué hace un test?",
  opciones: ["A", "B"],
  correcta: 1,
  explicacion: "Porque sí.",
});

describe("quizSchema", () => {
  const five = ["p1", "p2", "p3", "p4", "p5"].map(question);

  it("accepts 5 questions", () => {
    expect(quizSchema.safeParse({ preguntas: five }).success).toBe(true);
  });

  it("rejects fewer than 5 questions", () => {
    expect(quizSchema.safeParse({ preguntas: five.slice(0, 4) }).success).toBe(false);
  });

  it("rejects duplicated ids", () => {
    const dup = [...five.slice(0, 4), question("p1")];
    expect(quizSchema.safeParse({ preguntas: dup }).success).toBe(false);
  });

  it("rejects a correct index outside the options", () => {
    const bad = [...five.slice(0, 4), { ...question("p5"), correcta: 2 }];
    expect(quizSchema.safeParse({ preguntas: bad }).success).toBe(false);
  });
});

describe("exerciseSchema", () => {
  const base = { slug: "login-basico", tipo: "guiado", titulo: "Login básico" };

  it("requires 3 hints and a solution for guided exercises", () => {
    expect(exerciseSchema.safeParse(base).success).toBe(false);
    expect(
      exerciseSchema.safeParse({ ...base, pistas: ["a", "b", "c"], solucion: "x" }).success,
    ).toBe(true);
  });

  describe("challenge (tipo reto)", () => {
    const criterion = {
      id: "suite-ejecuta",
      titulo: "Al menos 3 tests",
      tipo: "suite_ejecuta",
      min: 3,
      peso: 10,
      competencia: "tecnica",
      feedback_fallo: "Escribe más tests.",
    };
    const reto = {
      ...base,
      tipo: "reto",
      escenario: "fase1-login",
      criterio_aprobacion: {
        version: 1,
        arena: { escenario: "fase1-login", release: null, semilla: 1046 },
        umbral: 70,
        criterios: [criterion],
      },
    };

    it("accepts a challenge with valid criteria and no hints", () => {
      expect(exerciseSchema.safeParse(reto).success).toBe(true);
    });

    it("rejects a challenge without criteria", () => {
      expect(exerciseSchema.safeParse({ ...base, tipo: "reto" }).success).toBe(false);
    });

    it("rejects invalid criteria with the path under criterio_aprobacion", () => {
      const bad = { ...reto, criterio_aprobacion: { ...reto.criterio_aprobacion, umbral: 101 } };
      const r = exerciseSchema.safeParse(bad);
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues[0]?.path).toEqual(["criterio_aprobacion", "umbral"]);
    });

    it("requires the exercise scenario to match the Arena scenario", () => {
      expect(exerciseSchema.safeParse({ ...reto, escenario: "baseline" }).success).toBe(false);
      const noScenario: Record<string, unknown> = { ...reto };
      delete noScenario.escenario;
      expect(exerciseSchema.safeParse(noScenario).success).toBe(false);
    });

    it("does not apply the criteria shape to other types", () => {
      const guided = { ...base, pistas: ["a", "b", "c"], solucion: "x" };
      expect(exerciseSchema.safeParse({ ...guided, criterio_aprobacion: { x: 1 } }).success).toBe(
        true,
      );
    });
  });
});

describe("estado", () => {
  it("defaults to borrador", () => {
    const r = validateLessonFrontmatter(valid);
    expect(r.success && r.data.estado).toBe("borrador");
  });
});

describe("findTodoMarkers", () => {
  it("finds lines that are just TODO", () => {
    expect(findTodoMarkers("## 1. Objetivo\n\nTODO\n\n## 2. Teoría\n  TODO  \r\n")).toEqual([3, 6]);
  });

  it("ignores the word inside real prose or code", () => {
    expect(findTodoMarkers("Usa un comentario // TODO: luego\nLa lista TODO app")).toEqual([]);
  });
});
