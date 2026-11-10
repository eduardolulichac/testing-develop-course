import { describe, expect, it } from "vitest";
import {
  criteriaOf,
  githubLinks,
  previewCriteria,
  remainingThisHour,
  statusMessage,
} from "./history";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("remainingThisHour", () => {
  it("counts only the last 60 minutes", () => {
    expect(remainingThisHour([], NOW)).toBe(10);
    expect(remainingThisHour([ago(5), ago(59), ago(61), ago(300)], NOW)).toBe(8);
  });
  it("never goes below zero", () => {
    expect(remainingThisHour(Array(12).fill(ago(1)), NOW)).toBe(0);
  });
});

describe("criteriaOf", () => {
  it("reads the stored criteria", () => {
    const [c] = criteriaOf({
      criterios: [{ id: "a", status: "fail", evidence: "<script>x</script>", titulo: "T" }],
    });
    expect(c).toMatchObject({ id: "a", status: "fail", evidence: "<script>x</script>" });
  });
  it("returns nothing for malformed or empty detail", () => {
    expect(criteriaOf({})).toEqual([]);
    expect(criteriaOf(null)).toEqual([]);
    expect(criteriaOf({ criterios: [{ id: 1 }] })).toEqual([]);
  });
});

describe("previewCriteria", () => {
  it("drops feedback and marks mandatory criteria", () => {
    const raw = {
      version: 1,
      arena: { escenario: "fase1-login", release: null, semilla: 1 },
      umbral: 70,
      obligatorios: ["a"],
      criterios: [
        {
          id: "a",
          titulo: "A",
          tipo: "suite_ejecuta",
          min: 1,
          peso: 60,
          competencia: "tecnica",
          feedback_fallo: "secret hint",
        },
        {
          id: "b",
          titulo: "B",
          tipo: "estatico",
          regla: "sin-only",
          peso: 40,
          competencia: "tecnica",
          feedback_fallo: "x",
        },
      ],
    };
    const p = previewCriteria(raw);
    expect(p).toEqual([
      { id: "a", titulo: "A", peso: 60, obligatorio: true },
      { id: "b", titulo: "B", peso: 40, obligatorio: false },
    ]);
    expect(JSON.stringify(p)).not.toContain("secret hint");
  });
  it("returns nothing for an invalid definition", () => {
    expect(previewCriteria({})).toEqual([]);
  });
});

describe("statusMessage", () => {
  it("gives a category and never the internal reason", () => {
    expect(statusMessage({ estado_verificacion: "rechazado", motivo: "run_not_verified" })).toMatch(
      /workflow/,
    );
    expect(
      statusMessage({ estado_verificacion: "rechazado", motivo: "run_not_verified" }),
    ).not.toMatch(/run_not_verified/);
    expect(statusMessage({ estado_verificacion: "verificado", motivo: null })).toBe("");
  });
});

describe("githubLinks", () => {
  const sha = "a".repeat(40);
  it("builds links for a github.com repo", () => {
    expect(githubLinks("https://github.com/u/r", sha, 7)).toEqual({
      commit: `https://github.com/u/r/commit/${sha}`,
      run: "https://github.com/u/r/actions/runs/7",
    });
  });
  it("refuses other hosts and malformed values", () => {
    expect(githubLinks("https://evil.test/u/r", sha, 7)).toEqual({ commit: null, run: null });
    expect(githubLinks("javascript:alert(1)", sha, 7)).toEqual({ commit: null, run: null });
    expect(githubLinks("https://github.com/u/r", "zz", 7)).toEqual({ commit: null, run: null });
    expect(githubLinks("https://github.com/u/r", sha, null).run).toBeNull();
  });
});
