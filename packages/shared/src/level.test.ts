import { describe, expect, it } from "vitest";
import type { Competency } from "./challenge-result";
import {
  LEVEL_RULES_V1,
  attemptFactor,
  computeLevel,
  levelDetailSchema,
  type LevelChallenge,
  type LevelEvidence,
  type Tramo,
} from "./level";

const NO_QUIZZES: LevelEvidence["quizzes"] = [];

/** A challenge measuring tecnica 65 and analisis 35 (like reto-1-1-login). */
function challenge(
  slug: string,
  tramo: Tramo,
  approved: LevelChallenge["aprobado"] = null,
  over: Partial<LevelChallenge> = {},
): LevelChallenge {
  return {
    slug,
    titulo: `Reto ${slug}`,
    modulo: `${tramo}.${slug.length}`,
    tramo,
    orden: Number(slug.replace(/\D/g, "")) || 0,
    pesos: { tecnica: 65, analisis: 35 },
    pesoTotal: 100,
    aprobado: approved,
    ...over,
  };
}

const ok = (intento: number, tecnica = 100, analisis = 100): LevelChallenge["aprobado"] => ({
  intento,
  competencias: { tecnica, analisis },
});

const evidence = (challenges: LevelChallenge[], quizzes = NO_QUIZZES): LevelEvidence => ({
  challenges,
  quizzes,
});

function scoreOf(result: ReturnType<typeof computeLevel>, c: Competency) {
  return result.competencias.find((x) => x.competencia === c);
}

describe("LEVEL_RULES_V1", () => {
  it("maps every phase to a tramo and keeps thresholds increasing", () => {
    expect(Object.keys(LEVEL_RULES_V1.tramoPorFase)).toHaveLength(6);
    const umbrales = LEVEL_RULES_V1.niveles.map((n) => n.umbral);
    expect(umbrales).toEqual([55, 60, 65, 70]);
  });

  it("applies the attempt factor 1 / 0.85 / 0.7", () => {
    expect([1, 2, 3, 5, 6, 40].map((i) => attemptFactor(i))).toEqual([1, 1, 0.85, 0.85, 0.7, 0.7]);
  });
});

describe("computeLevel", () => {
  it("1: a student with no submissions is level 0 with no scores and a to-do list", () => {
    const r = computeLevel(evidence([challenge("r1", 1)]));
    expect(r.nivelConfirmado).toBe(0);
    expect(r.nivelProvisional).toBe(0);
    expect(r.competencias).toEqual([]);
    expect(r.detalle.siguiente).toBe(1);
    expect(r.detalle.faltan.length).toBeGreaterThan(0);
    expect(levelDetailSchema.safeParse(r.detalle).success).toBe(true);
  });

  it("2: one approved challenge with 100 gives provisional 1, confirmed 0 and data only for tecnica and analisis", () => {
    const r = computeLevel(evidence([challenge("r1", 1, ok(1))]));
    expect(r.nivelConfirmado).toBe(0);
    expect(r.nivelProvisional).toBe(1);
    expect(r.competencias.map((c) => c.competencia).sort()).toEqual(["analisis", "tecnica"]);
    const autonomia = r.detalle.competencias.find((c) => c.competencia === "autonomia");
    expect(autonomia).toMatchObject({ estado: "sin_datos", se_mide_desde: null });
    expect(r.detalle.faltan).toContainEqual({
      tipo: "contenido",
      tramo: 1,
      motivo: "pocos_retos_publicados",
    });
    expect(levelDetailSchema.safeParse(r.detalle).success).toBe(true);
  });

  it("3 and 4: the value is frozen with the attempt factor, so a late 100 does not beat an early 80", () => {
    const early = computeLevel(evidence([challenge("r1", 1, ok(1, 80, 80))]));
    const late = computeLevel(evidence([challenge("r1", 1, ok(6, 80, 80))]));
    const lateFull = computeLevel(evidence([challenge("r1", 1, ok(6, 100, 100))]));
    expect(scoreOf(early, "tecnica")?.puntaje).toBe(80);
    expect(scoreOf(late, "tecnica")?.puntaje).toBe(56);
    expect(scoreOf(lateFull, "tecnica")?.puntaje).toBe(70);
    expect(scoreOf(lateFull, "tecnica")!.puntaje).toBeLessThan(scoreOf(early, "tecnica")!.puntaje);
  });

  it("5, 6 and 7: unapproved challenges add no evidence and never lower the score", () => {
    const base = computeLevel(evidence([challenge("r1", 1, ok(1)), challenge("r2", 1)]));
    expect(scoreOf(base, "tecnica")).toMatchObject({ puntaje: 100, evidencia: 1 });
  });

  it("8: only the first quiz attempt counts and only when pesoQuiz > 0", () => {
    const quizzes = [{ tramo: 1 as Tramo, nota: 40 }];
    const challenges = [challenge("r1", 1, ok(1))];
    const withoutQuiz = computeLevel(evidence(challenges, quizzes));
    expect(scoreOf(withoutQuiz, "tecnica")?.puntaje).toBe(100);
    const rules = { ...LEVEL_RULES_V1, pesoQuiz: 0.2 };
    const withQuiz = computeLevel(evidence(challenges, quizzes), rules);
    // (0.65 * 100 + 0.2 * 40) / (0.65 + 0.2) = 85.88
    expect(scoreOf(withQuiz, "tecnica")?.puntaje).toBe(85.88);
  });

  it("9: tramo 1 needs 80% coverage of the available challenges", () => {
    const five = (approved: number) =>
      evidence([1, 2, 3, 4, 5].map((n) => challenge(`r${n}`, 1, n <= approved ? ok(1) : null)));
    expect(computeLevel(five(3)).nivelConfirmado).toBe(0);
    expect(computeLevel(five(4)).nivelConfirmado).toBe(1);
  });

  it("10: a required competency below the threshold blocks; a non-required one within tolerance does not", () => {
    const base = (analisis: number) =>
      evidence([1, 2].map((n) => challenge(`r${n}`, 1, ok(1, 100, analisis))));
    expect(computeLevel(base(50)).nivelConfirmado).toBe(0);
    expect(computeLevel(base(60)).nivelConfirmado).toBe(1);

    // criterio_ia is not required for level 1: U - 5 passes, U - 15 blocks.
    const withIa = (score: number) =>
      evidence(
        [1, 2].map((n) =>
          challenge(
            `r${n}`,
            1,
            { intento: 1, competencias: { tecnica: 100, analisis: 100, criterio_ia: score } },
            {
              pesos: { tecnica: 50, analisis: 30, criterio_ia: 20 },
            },
          ),
        ),
      );
    expect(computeLevel(withIa(50)).nivelConfirmado).toBe(1);
    expect(computeLevel(withIa(40)).nivelConfirmado).toBe(0);
  });

  it("11: quality is accumulated, so a strong tramo 2 compensates a weak tramo 1", () => {
    const weights = { pesos: { tecnica: 40, analisis: 30, autonomia: 30 }, pesoTotal: 100 };
    const t2 = (n: number) =>
      challenge(
        `r2${n}`,
        2,
        { intento: 1, competencias: { tecnica: 90, analisis: 90, autonomia: 90 } },
        weights,
      );
    const r = computeLevel(
      evidence([
        challenge("r11", 1, ok(1, 50, 50), weights),
        challenge("r12", 1, ok(1, 50, 50), weights),
        t2(1),
        t2(2),
        t2(3),
        t2(4),
      ]),
    );
    // tecnica: (2 * 50 + 4 * 90) / 6 = 76.67 >= 60 although level 1 alone (50) is below 55.
    expect(r.nivelConfirmado).toBe(2);
  });

  it("12: a challenge published later lowers coverage and only changes the to-do list", () => {
    const done = [challenge("r1", 1, ok(1)), challenge("r2", 1, ok(1))];
    expect(computeLevel(evidence(done)).nivelConfirmado).toBe(1);
    const more = computeLevel(evidence([...done, challenge("r3", 1), challenge("r4", 1)]));
    // The caller applies `greatest(actual, nuevo)`: the pure result is allowed to be lower.
    expect(more.nivelConfirmado).toBe(0);
    expect(more.detalle.faltan.some((f) => f.tipo === "retos")).toBe(true);
  });

  it("never drops below the floor and builds the to-do list from it", () => {
    const e = evidence([challenge("r1", 1, ok(1)), challenge("r2", 1)]);
    expect(computeLevel(e).nivelConfirmado).toBe(0);
    const r = computeLevel(e, LEVEL_RULES_V1, 1);
    expect(r.nivelConfirmado).toBe(1);
    expect(r.nivelProvisional).toBe(1);
    expect(r.detalle.siguiente).toBe(2);
  });

  it("a weight added after the approval does not count as 'measured' (provisional is not blocked)", () => {
    const late = (slug: string) =>
      challenge(slug, 1, ok(1), { pesos: { tecnica: 40, analisis: 30, autonomia: 30 } });
    const e = evidence([
      late("r1"),
      late("r2"),
      challenge("r30", 2, ok(1)),
      challenge("r31", 2, ok(1)),
    ]);
    const r = computeLevel(e);
    // Autonomy has no frozen value anywhere and no pending challenge can still give it.
    expect(r.nivelProvisional).toBe(2);
    expect(r.nivelConfirmado).toBe(1);
    expect(r.detalle.faltan).toContainEqual({ tipo: "sin_medir", competencia: "autonomia" });
    expect(
      r.detalle.faltan.some((f) => f.tipo === "calidad" && f.competencia === "autonomia"),
    ).toBe(false);
    expect(r.detalle.competencias.find((c) => c.competencia === "autonomia")).toMatchObject({
      estado: "sin_datos",
      se_mide_desde: null,
    });
    // A pending challenge with that weight does count: the student can still earn it.
    const pending = computeLevel(
      evidence([...e.challenges, challenge("r32", 2, null, { pesos: { autonomia: 100 } })]),
    );
    expect(pending.nivelProvisional).toBeLessThan(2);
  });

  it("14: a competency whose weight became 0 has no data any more", () => {
    const r = computeLevel(
      evidence([challenge("r1", 1, ok(1), { pesos: { tecnica: 100 }, pesoTotal: 100 })]),
    );
    expect(scoreOf(r, "analisis")).toBeUndefined();
  });

  it("15: level 4 requires the mandatory final project", () => {
    const rules = {
      ...LEVEL_RULES_V1,
      niveles: LEVEL_RULES_V1.niveles.map((n) => ({
        ...n,
        requeridas: ["tecnica", "analisis"] as Competency[],
      })),
    };
    const all = (finalDone: boolean) =>
      evidence(
        ([1, 2, 3, 4] as Tramo[]).flatMap((t) => [
          challenge(`a${t}`, t, ok(1)),
          challenge(`b${t}`, t, ok(1)),
          t === 4
            ? challenge("reto-5-6-proyecto-final", t, finalDone ? ok(1) : null)
            : challenge(`c${t}`, t, ok(1)),
        ]),
      );
    expect(computeLevel(all(true), rules).nivelConfirmado).toBe(4);
    const without = computeLevel(all(false), rules);
    expect(without.nivelConfirmado).toBe(3);
  });

  it("16: is idempotent and deterministic", () => {
    const e = evidence([challenge("r1", 1, ok(2, 90, 80)), challenge("r2", 1, ok(4, 70, 75))]);
    expect(computeLevel(e)).toEqual(computeLevel(e));
  });

  it("lists the pending challenges in course order without leaking anything else", () => {
    const r = computeLevel(
      evidence([challenge("r9", 1), challenge("r2", 1), challenge("r5", 1, ok(1))]),
    );
    const retos = r.detalle.faltan.find((f) => f.tipo === "retos");
    expect(retos).toMatchObject({ tipo: "retos", tramo: 1 });
    if (retos?.tipo === "retos") {
      expect(retos.pendientes.map((p) => p.slug)).toEqual(["r2", "r9"]);
      expect(Object.keys(retos.pendientes[0]!).sort()).toEqual(["modulo", "slug", "titulo"]);
    }
  });

  it("reports sin_medir when no available challenge measures a required competency", () => {
    const rules = LEVEL_RULES_V1;
    const e = evidence([1, 2].map((n) => challenge(`r${n}`, 1, ok(1))));
    const r = computeLevel(e, rules);
    expect(r.nivelConfirmado).toBe(1);
    const next = computeLevel(
      evidence([...e.challenges, challenge("r30", 2), challenge("r31", 2)]),
      rules,
    );
    expect(next.detalle.siguiente).toBe(2);
    expect(next.detalle.faltan).toContainEqual({ tipo: "sin_medir", competencia: "autonomia" });
  });
});
