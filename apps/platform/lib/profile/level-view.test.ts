import { describe, expect, it } from "vitest";
import {
  buildApprovedChallenges,
  buildCompetencyCards,
  describeRequirement,
  levelHeadline,
  parseDetail,
} from "./level-view";

const detail = {
  reglas_version: 1,
  siguiente: 1,
  tramos: [],
  competencias: [
    { competencia: "tecnica", estado: "con_datos", puntaje: 100, evidencia: 1 },
    { competencia: "autonomia", estado: "sin_datos", se_mide_desde: "1.3" },
    { competencia: "criterio_ia", estado: "sin_datos", se_mide_desde: null },
  ],
  faltan: [{ tipo: "contenido", tramo: 1, motivo: "pocos_retos_publicados" }],
};

describe("levelHeadline", () => {
  it("shows the confirmed level and, only if higher, the provisional one with the reason", () => {
    expect(levelHeadline(null, null)).toEqual({ confirmed: "Fundamentos", provisional: null });
    const parsed = parseDetail(detail);
    expect(
      levelHeadline({ nivel_confirmado: 0, nivel_provisional: 1, detalle: detail }, parsed),
    ).toEqual({
      confirmed: "Fundamentos",
      provisional: "Junior (provisional: aún hay pocos retos publicados)",
    });
    expect(
      levelHeadline({ nivel_confirmado: 1, nivel_provisional: 1, detalle: detail }, parsed)
        .provisional,
    ).toBeNull();
  });

  it("drops a malformed detail instead of throwing", () => {
    expect(parseDetail({ basura: true })).toBeNull();
    expect(parseDetail(null)).toBeNull();
  });
});

describe("buildCompetencyCards", () => {
  it("always returns the five competencies; without a row it says there is no evidence", () => {
    const cards = buildCompetencyCards(
      [{ competencia: "tecnica", puntaje: "100.00", nivel: 1, evidencia: 1 }],
      parseDetail(detail),
    );
    expect(cards.map((c) => c.competencia)).toEqual([
      "tecnica",
      "analisis",
      "criterio_ia",
      "comunicacion",
      "autonomia",
    ]);
    expect(cards[0]!.data).toEqual({ puntaje: 100, nivel: "Junior", evidencia: 1 });
    expect(cards[1]!.data).toBeNull();
    expect(cards.find((c) => c.competencia === "autonomia")!.note).toBe(
      "Se mide desde el módulo 1.3.",
    );
    expect(cards.find((c) => c.competencia === "criterio_ia")!.note).toBe(
      "Se medirá en retos futuros.",
    );
  });
});

describe("describeRequirement", () => {
  it("lists pending challenges by module and title only", () => {
    const r = describeRequirement({
      tipo: "retos",
      tramo: 1,
      faltan: 2,
      pendientes: [{ slug: "reto-1-2", titulo: "Localizadores", modulo: "1.2" }],
    });
    expect(r.text).toContain("2 retos más");
    expect(r.items).toEqual([{ slug: "reto-1-2", label: "1.2 · Localizadores" }]);
  });

  it("explains quality with the frozen-value truth, and flags content gaps as not the student's fault", () => {
    expect(
      describeRequirement({ tipo: "calidad", competencia: "analisis", actual: 52.3, umbral: 60 })
        .text,
    ).toContain("quedan fijos");
    expect(
      describeRequirement({ tipo: "contenido", tramo: 2, motivo: "pocos_retos_publicados" }).text,
    ).toContain("no depende de ti");
    expect(describeRequirement({ tipo: "sin_medir", competencia: "criterio_ia" }).text).toContain(
      "Criterio con IA",
    );
  });
});

describe("buildApprovedChallenges", () => {
  it("uses the first approved attempt and its factor", () => {
    const ex = new Map([["e1", { slug: "reto-1-1-login", titulo: "Login" }]]);
    const rows = [
      { exercise_id: "e1", intento: 6, puntaje: "100.00" },
      { exercise_id: "e1", intento: 3, puntaje: "80.00" },
      { exercise_id: "e1", intento: null, puntaje: null },
      { exercise_id: "ghost", intento: 1, puntaje: 100 },
    ];
    expect(buildApprovedChallenges(rows, ex)).toEqual([
      { slug: "reto-1-1-login", titulo: "Login", intento: 3, factor: 0.85, puntaje: 80, valor: 68 },
    ]);
  });
});
